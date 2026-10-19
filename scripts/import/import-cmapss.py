#!/usr/bin/env python3
"""Importa el dataset **NASA C-MAPSS** (FD001 por defecto) a MaintainPredict.

Qué hace
--------
Cada motor del dataset se convierte en un equipo con 21 sensores (`s1` … `s21`), y cada
ciclo de simulación en una lectura por sensor. Los umbrales de cada sensor se calculan a
partir del **propio dataset** (mínimo y máximo observados), para que la clasificación de
calidad de `fn_classify_reading` tenga sentido y no marque todo como `suspect`.

Los ciclos se reescalan para que el último ciclo de cada motor caiga aproximadamente en el
momento de la importación (`--hours-per-cycle`, 6 h por defecto), de modo que el histórico
entre dentro de las ventanas de 30 días que usan el dashboard y `/observability`.

Uso
---
    python scripts/import/import-cmapss.py --dry-run
    python scripts/import/import-cmapss.py --limit 5          # solo 5 motores
    python scripts/import/import-cmapss.py --path data/datasets/cmapss/train_FD001.txt

Requiere: `pip install psycopg2-binary`.
"""

from __future__ import annotations

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

N_SENSORS = 21
SENSOR_NAMES = [f"s{i}" for i in range(1, N_SENSORS + 1)]


def load(path: Path, limit: int | None):
    """Devuelve {unit: [(cycle, ts, [valores...]), ...]} preservando el orden de ciclos."""
    units: dict[str, list[tuple[int, float, list[float]]]] = {}
    with path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            parts = line.split()
            if len(parts) < 5 + N_SENSORS:
                continue
            unit = parts[0]
            if limit is not None and unit not in units and len(units) >= limit:
                break
            cycle = int(float(parts[1]))
            values = [float(x) for x in parts[5:5 + N_SENSORS]]
            units.setdefault(unit, []).append((cycle, values))
    return units


def main() -> int:
    parser = common_parser(__doc__ or "", "data/datasets/cmapss/train_FD001.txt")
    parser.add_argument("--hours-per-cycle", type=float, default=6.0,
                        help="Horas reales por ciclo de simulación (por defecto 6)")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        fail_missing(path)

    units = load(path, args.limit)
    readings = sum(len(cycles) for cycles in units.values()) * N_SENSORS
    print(f"→ {len(units)} motores, {sum(len(c) for c in units.values())} ciclos, {readings} lecturas")

    # Umbrales por sensor a partir del propio dataset (margen del 2 % para no marcar
    # como 'suspect' los valores extremos normales de cada motor).
    minimums = [float("inf")] * N_SENSORS
    maximums = [float("-inf")] * N_SENSORS
    for cycles in units.values():
        for _, values in cycles:
            for i, value in enumerate(values):
                minimums[i] = min(minimums[i], value)
                maximums[i] = max(maximums[i], value)
    span = [max(maximums[i] - minimums[i], 1e-9) for i in range(N_SENSORS)]
    thresholds = [
        (minimums[i] - span[i] * 0.02, maximums[i] + span[i] * 0.02) for i in range(N_SENSORS)
    ]

    if args.dry_run:
        print("--dry-run: no se escribe nada.")
        for i, (lo, hi) in enumerate(thresholds[:3], start=1):
            print(f"   umbral s{i} ....... [{lo:.3f}, {hi:.3f}]  (p. ej.)")
        return 0

    conn = connect(args)
    cur = conn.cursor()

    if already_imported(cur, "CMAPSS-") and not args.force:
        print("Ya hay equipos 'CMAPSS-'. Usa --force para reimportar.")
        return 0

    now = datetime.now(timezone.utc)
    for unit, cycles in units.items():
        cur.execute(
            """
            INSERT INTO equipment (name, type, location, criticality, installation_date,
                                   status, downtime_cost_eur_h)
            VALUES (%s, 'Turbine', 'Planta-NASA/Motor', 'high', %s, 'operational', 5000)
            RETURNING equipment_id
            """,
            (f"CMAPSS-U{unit}", (now - timedelta(days=3 + int(unit) % 30)).date()),
        )
        equipment_id = cur.fetchone()[0]

        sensor_ids = []
        for i in range(N_SENSORS):
            lo, hi = thresholds[i]
            cur.execute(
                """
                INSERT INTO sensors (equipment_id, type, unit, status, min_threshold, max_threshold)
                VALUES (%s, %s, 'n/d', 'active', %s, %s) RETURNING sensor_id
                """,
                (equipment_id, SENSOR_NAMES[i], lo, hi),
            )
            sensor_ids.append(cur.fetchone()[0])

        last_cycle = max(c for c, _ in cycles)

        def reading_rows():
            for cycle, values in cycles:
                ts = now - timedelta(hours=(last_cycle - cycle) * args.hours_per_cycle)
                for i, value in enumerate(values):
                    lo, hi = thresholds[i]
                    yield (sensor_ids[i], value, quality_for(value, lo, hi), ts)

        insert_readings(cur, reading_rows())
        cur.execute(
            """
            INSERT INTO predictions (equipment_id, component, failure_probability, window_days,
                                     model_version, explanation, created_at)
            VALUES (%s, 'bearing', 0.75, 7, 'cmapss-import',
                    'Serie C-MAPSS de ciclo a falla: el motor alcanza el fin de vida útil', %s)
            """,
            (equipment_id, now),
        )

    conn.commit()
    cur.close()
    conn.close()
    print(f"C-MAPSS importado: {len(units)} equipos, {readings} lecturas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
