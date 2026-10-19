# `scripts/import/` — Importadores de datasets públicos

Herramientas **opcionales** para cargar datos reales del catálogo de [`data/README.md`](../../data/README.md).
No forman parte de la aplicación ni de CI: se lanzan a mano y **nunca** son necesarios para
arrancar MaintainPredict (los seeds de `infra/postgres/init/*.sql` ya dejan el sistema con
500 equipos, ~600.000 lecturas, ~800 predicciones, ~600 órdenes y 30 documentos de KB).

| Script | Dataset | Escribe en |
|---|---|---|
| `import-ai4i.py` | AI4I 2020 (10 MB) | `equipment`, `sensors`, `readings`, `predictions` |
| `import-azure-pdm.py` | Microsoft Azure PdM (~500 MB) | `equipment`, `sensors`, `readings`, `maintenance_orders`, `predictions` |
| `import-cmapss.py` | NASA C-MAPSS (~2 GB) | `equipment`, `sensors`, `readings`, `predictions` |
| `import-osha-kb.py` | OSHA / normativa pública | `kb_maintenance` (`category = 'normativa'`) |

Del listado completo de la spec (CWRU, Intel Lab, Mining, Wind SCADA, arXiv, Loghub…) **no
están implementados**: requieren formatos distintos (`.mat`, audio, logs) y no aportan al
cierre actual. Quedan documentados en el catálogo como trabajo futuro.

## Requisitos

```bash
pip install psycopg2-binary
```

La conexión sale de `.env` (las mismas variables que usa la aplicación). Por defecto el host
es `localhost` para poder lanzarlos desde el equipo; si los ejecutas dentro de la red de
Docker, pasa `--host postgres`.

## Reglas comunes

* **`--dry-run` primero.** Lee, valida y cuenta sin abrir la base. Úsalo siempre antes de
  escribir.
* **Idempotente.** Si el dataset ya está cargado (se detecta por el prefijo de nombre de los
  equipos: `AI4I-`, `AZ-`, `CMAPSS-`) no vuelve a insertarlo; `--force` lo reimporta.
* **Volumen acotado.** `--limit N` procesa solo N filas/motores. Los importadores con fechas
  desplazan el histórico para que el evento más reciente caiga en el momento de la
  importación: si no, los datos caerían fuera de las ventanas de 30 días que miran el
  dashboard y `/observability` y parecería que no se ha importado nada.

## Ruta mínima (< 1 hora)

Los cuatro pasos con los que el sistema queda alimentado con datos reales:

```bash
# 0) Descargar los 4 datasets (ver data/README.md): AI4I, Azure PdM, C-MAPSS, OSHA

# 1) AI4I 2020 → lecturas y predicciones etiquetadas (1 minuto)
python scripts/import/import-ai4i.py --dry-run
python scripts/import/import-ai4i.py

# 2) Azure PdM → equipos, sensores y órdenes históricas (5-10 minutos)
python scripts/import/import-azure-pdm.py --dry-run --since-days 7
python scripts/import/import-azure-pdm.py --since-days 7

# 3) NASA C-MAPSS → series de ciclo a falla para entrenar RUL (5-10 minutos)
python scripts/import/import-cmapss.py --dry-run --limit 20
python scripts/import/import-cmapss.py --limit 20

# 4) OSHA → 20-30 documentos de normativa para el RAG
python scripts/import/import-osha-kb.py --dry-run
python scripts/import/import-osha-kb.py
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'   # vectoriza (Gemini)
```

Al terminar, comprueba el resultado:

```bash
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c "
  SELECT 'equipment' AS tabla, count(*) FROM equipment
  UNION ALL SELECT 'sensors', count(*) FROM sensors
  UNION ALL SELECT 'readings', count(*) FROM readings
  UNION ALL SELECT 'predictions', count(*) FROM predictions
  UNION ALL SELECT 'maintenance_orders', count(*) FROM maintenance_orders
  UNION ALL SELECT 'kb_maintenance', count(*) FROM kb_maintenance;"
```

## Advertencia sobre el mapeo de AI4I

AI4I 2020 no trae sensores industriales genéricos. Para que el pipeline tenga series con
tendencia creciente, `import-ai4i.py` reinterpreta dos columnas:

    Torque [Nm]     → sensor tipo 'pressure'
    Tool wear [min] → sensor tipo 'current'

Es un mapeo **de pruebas** (viene así en la spec), no una equivalencia física. No sirve para
sacar conclusiones de ingeniería; si se añaden tipos de sensor propios, hay que cambiarlo.
