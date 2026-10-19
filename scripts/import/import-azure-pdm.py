#!/usr/bin/env python3
"""Importa el dataset **Microsoft Azure Predictive Maintenance** a MaintainPredict.

Qué hace
--------
Lee la carpeta del dataset (`PdM_*.csv`) y carga:

| Fichero del dataset | Tabla destino | Detalle |
|---|---|---|
| `PdM_machines.csv`  | `equipment`        | Un equipo `AZ-<modelo>-<id>` por máquina |
| (derivado)          | `sensors`          | 4 sensores: volt, rotate, pressure, vibration |
| `PdM_telemetry.csv` | `readings`         | Una lectura por sensor y hora telemetría |
| `PdM_maint.csv`     | `maintenance_orders` | Órdenes **históricas completadas** |
| `PdM_failures.csv`  | `predictions`      | Predicción por falla etiquetada |

⚠️ Dos decisiones que conviene conocer
--------------------------------------
1. **Desplazamiento temporal.** El dataset es de 2015. Si se importara con sus fechas
   originales, quedaría fuera de las ventanas de 30 días del dashboard y de
   `/observability` (y parecería que no se ha importado nada). Por eso todo el histórico se
   desplaza para que el evento **más reciente caiga en el momento de la importación**.
2. **Recorte.** `--since-days` (30 por defecto) limita la telemetría a los últimos N días
   *del propio dataset* antes de desplazarla. Sin recorte son ~876.000 filas × 4 sensores.

Uso
---
    python scripts/import/import-azure-pdm.py --dry-run
    python scripts/import/import-azure-pdm.py --since-days 7
    python scripts/import/import-azure-pdm.py --path data/datasets/azure-pdm

Requiere: `pip install psycopg2-binary`.
"""

from __future__ import annotations

import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _common import (
    already_imported,
    common_parser,
    connect,
    fail_missing,
    insert_readings,
    quality_for,
)

SENSORS = {
    "volt": ("voltage", "V", 150.0, 210.0),
    "rotate": ("rpm", "rpm", 0.0, 700.0),
    "pressure": ("pressure", "bar", 50.0, 140.0),
    "vibration": ("vibration", "mm/s", 20.0, 60.0),
}


def parse_dt(value: str) -> datetime:
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Fecha no reconocida: {value!r}")


def read_csv(path: Path, limit: int | None = None):
    with path.open(newline="", encoding="utf-8", errors="replace") as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            if limit is not None and i >= limit:
                break
            yield row


def main() -> int:
    parser = common_parser(__doc__ or "", "data/datasets/azure-pdm")
    parser.add_argument("--since-days", type=int, default=30,
                        help="Recortar la telemetría a los últimos N días del dataset (por defecto 30)")
    args = parser.parse_args()

    folder = Path(args.path)
    machines_csv = folder / "PdM_machines.csv"
    telemetry_csv = folder / "PdM_telemetry.csv"
    maint_csv = folder / "PdM_maint.csv"
    failures_csv = folder / "PdM_failures.csv"
    for required in (machines_csv, telemetry_csv):
        if not required.exists():
            fail_missing(required)

    machines = list(read_csv(machines_csv))
    print(f"→ {len(machines)} máquinas en PdM_machines.csv")

    # 1ª pasada: fecha máxima del dataset y filtro por ventana.
    cutoff_original = None
    latest = None
    if args.since_days >= 0:
        for row in read_csv(telemetry_csv):
            ts = parse_dt(row["datetime"])
            latest = ts if latest is None or ts > latest else latest
        cutoff_original = latest - timedelta(days=args.since_days) if latest else None

    in_window = 0
    for row in read_csv(telemetry_csv):
        if cutoff_original is None or parse_dt(row["datetime"]) >= cutoff_original:
            in_window += 1
    print(f"→ {in_window} filas de telemetría en la ventana"
          f"{'' if args.since_days < 0 else f' de {args.since_days} días'}")

    if args.dry_run:
        print("--dry-run: no se escribe nada.")
        print(f"   equipos ............. {len(machines)}")
        print(f"   sensores ............ {len(machines) * len(SENSORS)}")
        print(f"   lecturas ............ {in_window * len(SENSORS)}")
        print(f"   órdenes ............. ~{len(machines) * 2} (de PdM_maint.csv)")
        print(f"   predicciones ........ (de PdM_failures.csv)")
        return 0

    conn = connect(args)
    cur = conn.cursor()

    if already_imported(cur, "AZ-") and not args.force:
        print("Ya hay equipos 'AZ-'. Usa --force para reimportar.")
        return 0

    # El desplazamiento deja el último evento del dataset "ahora mismo".
    offset = (datetime.now(timezone.utc) - latest) if latest else timedelta(0)

    equipment_ids: dict[str, int] = {}
    sensor_ids: dict[str, dict[str, int]] = {}
    for machine in machines:
        mid = str(machine["machineID"])
        cur.execute(
            """
            INSERT INTO equipment (name, type, location, criticality, installation_date,
                                   status, downtime_cost_eur_h)
            VALUES (%s, %s, 'Planta-AZ/Linea-01', 'medium', %s, 'operational', %s)
            RETURNING equipment_id
            """,
            (
                f"AZ-{machine.get('model', 'model')}-{mid}",
                machine.get("model") or "AzurePdM",
                (datetime.now(timezone.utc) - timedelta(days=int(machine.get("age", 0) or 0))).date(),
                800.0 + int(mid) * 5,
            ),
        )
        eq_id = cur.fetchone()[0]
        equipment_ids[mid] = eq_id
        sensor_ids[mid] = {}
        for column, (sensor_type, unit, minimum, maximum) in SENSORS.items():
            cur.execute(
                """
                INSERT INTO sensors (equipment_id, type, unit, status, min_threshold, max_threshold)
                VALUES (%s, %s, %s, 'active', %s, %s) RETURNING sensor_id
                """,
                (eq_id, sensor_type, unit, minimum, maximum),
            )
            sensor_ids[mid][column] = cur.fetchone()[0]
    print(f"  ✓ {len(equipment_ids)} equipos y {len(equipment_ids) * len(SENSORS)} sensores")

    def reading_rows():
        for row in read_csv(telemetry_csv):
            ts = parse_dt(row["datetime"])
            if cutoff_original is not None and ts < cutoff_original:
                continue
            machine = str(row["machineID"])
            if machine not in sensor_ids:
                continue
            for column, (_, _, minimum, maximum) in SENSORS.items():
                value = float(row[column])
                yield (sensor_ids[machine][column], value, quality_for(value, minimum, maximum), ts + offset)

    total = insert_readings(cur, reading_rows())
    print(f"  ✓ {total} lecturas insertadas")

    # Órdenes históricas a partir de PdM_maint.csv
    cur.execute("SELECT user_id FROM users WHERE role = 'supervisor' ORDER BY user_id LIMIT 1")
    row_sup = cur.fetchone()
    cur.execute("SELECT user_id FROM users WHERE role = 'technician' ORDER BY user_id LIMIT 1")
    row_tec = cur.fetchone()
    if maint_csv.exists() and row_sup and row_tec:
        supervisor_id, technician_id = row_sup[0], row_tec[0]
        orders = 0
        for row in read_csv(maint_csv, args.limit):
            machine = str(row["machineID"])
            if machine not in equipment_ids:
                continue
            ts = parse_dt(row["datetime"]) + offset
            cur.execute(
                """
                INSERT INTO maintenance_orders (
                  equipment_id, scheduled_date, technician_id, parts, estimated_downtime_h,
                  status, priority, requires_hitl, notes, approved_by, approved_at,
                  completed_at, created_at)
                VALUES (%s, %s, %s, '[]'::jsonb, 2.00, 'completed', 'medium', false, %s,
                        %s, %s, %s, %s)
                """,
                (
                    equipment_ids[machine],
                    ts + timedelta(days=1),
                    technician_id,
                    f"Importado de Azure PdM (componente: {row.get('comp', 'n/d')})",
                    supervisor_id,
                    ts + timedelta(days=1),
                    ts + timedelta(days=2),
                    ts,
                ),
            )
            orders += 1
        print(f"  ✓ {orders} órdenes históricas insertadas")
    else:
        print("  ! Se omiten las órdenes: falta PdM_maint.csv o no hay usuarios sembrados")

    if failures_csv.exists():
        predictions = 0
        for row in read_csv(failures_csv, args.limit):
            machine = str(row["machineID"])
            if machine not in equipment_ids:
                continue
            ts = parse_dt(row["datetime"]) + offset
            cur.execute(
                """
                INSERT INTO predictions (equipment_id, component, failure_probability, window_days,
                                         model_version, explanation, created_at)
                VALUES (%s, %s, 0.90, 7, 'azure-pdm-import',
                        'Falla etiquetada en el dataset Microsoft Azure PdM', %s)
                """,
                (equipment_ids[machine], row.get("failure") or "component", ts),
            )
            predictions += 1
        print(f"  ✓ {predictions} predicciones insertadas")

    conn.commit()
    cur.close()
    conn.close()
    print("Azure PdM importado. Genera las órdenes con:  POST /api/orders/auto-plan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
