#!/usr/bin/env python3
"""Importa el dataset **AI4I 2020** a MaintainPredict.

Qué hace
--------
1. Crea un equipo `AI4I-2020-Test` con 5 sensores.
2. Carga las 10.000 filas del CSV como lecturas (10.000 × 5 = 50.000 lecturas).
3. Crea una predicción por cada fila con `Machine failure = 1` (~340).

Las órdenes NO se crean aquí: las genera el propio sistema con
`POST /api/orders/auto-plan` (así pasan por `sealDraftOrder()` y la HITL estricta).

⚠️ Aviso sobre el mapeo (viene de la spec §10 y es deliberado)
-------------------------------------------------------------
AI4I no trae sensores industriales genéricos, así que se **reinterpretan** dos columnas:

    Torque [Nm]      → sensor tipo 'pressure'
    Tool wear [min]  → sensor tipo 'current'

Es un mapeo **de pruebas**, no una equivalencia física: sirve para que el pipeline tenga
series con tendencia creciente (el desgaste de herramienta) y no para sacar conclusiones de
ingeniería. Si algún día se añaden tipos de sensor propios, este importador debe cambiarse.

Uso
---
    python scripts/import/import-ai4i.py --dry-run
    python scripts/import/import-ai4i.py
    python scripts/import/import-ai4i.py --limit 500 --dry-run

Requiere: `pip install psycopg2-binary` y el CSV en `data/datasets/ai4i2020/ai4i2020.csv`.
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

EQUIPMENT_NAME = "AI4I-2020-Test"

# columna del CSV → (tipo de sensor, unidad, mínimo, máximo)
SENSOR_COLUMNS = {
    "Air temperature [K]": ("temperature", "K", 295.0, 305.0),
    "Process temperature [K]": ("temperature", "K", 305.0, 315.0),
    "Rotational speed [rpm]": ("rpm", "rpm", 1000.0, 3000.0),
    "Torque [Nm]": ("pressure", "Nm", 0.0, 80.0),      # ← mapeo de pruebas (ver cabecera)
    "Tool wear [min]": ("current", "min", 0.0, 250.0),  # ← mapeo de pruebas (ver cabecera)
}


def read_rows(path: Path, limit: int | None):
    with path.open(newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader):
            if limit is not None and i >= limit:
                break
            yield row


def main() -> int:
    parser = common_parser(__doc__ or "", "data/datasets/ai4i2020/ai4i2020.csv")
    parser.add_argument("--window-days", type=int, default=30,
                        help="Comprimir las 10.000 filas en los últimos N días (por defecto 30)")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        fail_missing(path)

    rows = list(read_rows(path, args.limit))
    failures = [r for r in rows if str(r.get("Machine failure", "0")).strip() == "1"]
    print(f"→ {len(rows)} filas leídas, {len(failures)} con Machine failure = 1")

    if args.dry_run:
        print("--dry-run: no se escribe nada.")
        print(f"   equipo a crear ....... {EQUIPMENT_NAME}")
        print(f"   sensores ............. {len(SENSOR_COLUMNS)}")
        print(f"   lecturas ............. {len(rows) * len(SENSOR_COLUMNS)}")
        print(f"   predicciones ......... {len(failures)}")
        return 0

    conn = connect(args)
    conn.autocommit = False
    cur = conn.cursor()

    if already_imported(cur, "AI4I-") and not args.force:
        print(f"Ya existe un equipo '{EQUIPMENT_NAME}'. Usa --force para reimportar.")
        return 0

    cur.execute(
        """
        INSERT INTO equipment (name, type, location, criticality, status, downtime_cost_eur_h)
        VALUES (%s, 'Motor', 'Planta-AI/Linea-01', 'high', 'operational', 500)
        RETURNING equipment_id
        """,
        (EQUIPMENT_NAME,),
    )
    equipment_id = cur.fetchone()[0]

    sensor_ids: dict[str, tuple[int, float, float]] = {}
    for column, (sensor_type, unit, minimum, maximum) in SENSOR_COLUMNS.items():
        cur.execute(
            """
            INSERT INTO sensors (equipment_id, type, unit, status, min_threshold, max_threshold)
            VALUES (%s, %s, %s, 'active', %s, %s) RETURNING sensor_id
            """,
            (equipment_id, sensor_type, unit, minimum, maximum),
        )
        sensor_ids[column] = (cur.fetchone()[0], minimum, maximum)

    # Las filas se reparten en la ventana pedida para que caigan dentro de los 30 días que
    # miran el dashboard y /observability (el CSV no trae marca temporal).
    span_seconds = max(args.window_days, 1) * 24 * 3600
    step = span_seconds / max(len(rows) - 1, 1)
    start = datetime.now(timezone.utc) - timedelta(seconds=span_seconds)

    def reading_rows():
        for i, row in enumerate(rows):
            ts = start + timedelta(seconds=step * i)
            for column, (sensor_id, minimum, maximum) in sensor_ids.items():
                value = float(row[column])
                yield (sensor_id, value, quality_for(value, minimum, maximum), ts)

    total = insert_readings(cur, reading_rows())
    print(f"  ✓ {total} lecturas insertadas")

    for row in failures:
        cur.execute(
            """
            INSERT INTO predictions (equipment_id, component, failure_probability, window_days,
                                     model_version, explanation, created_at)
            VALUES (%s, 'bearing', 0.85, 7, 'ai4i-import',
                    'Falla etiquetada en el dataset AI4I 2020 (Machine failure = 1)', %s)
            """,
            (equipment_id, datetime.now(timezone.utc) - timedelta(days=int(row.get("UDI", "0")) % 30)),
        )
    print(f"  ✓ {len(failures)} predicciones insertadas")

    conn.commit()
    cur.close()
    conn.close()
    print("AI4I importado. Genera las órdenes con:  POST /api/orders/auto-plan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
