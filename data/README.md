# `data/` — Datasets públicos para MaintainPredict AI

Esta carpeta **no contiene datos**: contiene el catálogo de datasets públicos que se pueden
usar como fuente real para cada módulo, cómo descargarlos y para qué sirve cada uno.

Los ficheros descargados van a `data/datasets/` (ignorada por git, igual que `data/raw/` y
`data/processed/`). Aquí solo se versiona este README.

```text
data/
├── README.md                     # este catálogo
└── datasets/                     # ← descargas (ignorado por git)
    ├── cmapss/                   train_FD001.txt · test_FD001.txt · RUL_FD001.txt
    ├── ai4i2020/                 ai4i2020.csv
    ├── azure-pdm/                PdM_telemetry.csv · PdM_errors.csv · PdM_failures.csv
    │                             PdM_machines.csv · PdM_maint.csv
    ├── cwru/                     Normal_0.mat · IR007_0.mat · OR007_0.mat · B007_0.mat
    ├── intel-lab/                data.txt
    ├── osha/                     *.txt / *.html (documentos convertidos)
    ├── arxiv/                    *.json (bulk de metadatos)
    └── loghub/                   HDFS_2k.log
```

> Nada de esto hace falta para arrancar la aplicación: `scripts/reset-db.sh` ya siembra un
> histórico completo y coherente (500 equipos, ~1.500 sensores, ~600.000 lecturas, ~800
> predicciones, ~600 órdenes, 30 documentos de KB). Los datasets son **opcionales** y sirven
> para (a) entrenar el ML con datos reales y (b) validar los importadores.

---

## Catálogo

Prioridad: 🔴 alta (aporta valor directo hoy) · 🟡 media (aporta con trabajo adicional) ·
🟢 baja (extensiones futuras).

| Dataset | Licencia | Tamaño | Módulo que alimenta | Prioridad |
|---|---|---|---|---|
| NASA C-MAPSS | Dominio público (NASA) | ~2 GB (4 subsets) | ML Service — RUL | 🔴 Alta |
| AI4I 2020 | CC BY 4.0 | 10 MB | ML Service — prototipado rápido | 🔴 Alta |
| Microsoft Azure PdM | Microsoft (uso libre) | ~500 MB | `equipment` + `sensors` + `readings` + órdenes | 🔴 Alta |
| CWRU Bearing | Investigación | ~1 GB | ML Service — vibración de rodamientos | 🔴 Alta |
| OSHA | Dominio público | — | RAG — `category = 'normativa'` | 🔴 Alta |
| Intel Lab | Dominio público | 40 MB | Sensores IoT (pipeline de ingesta) | 🟡 Media |
| Mining Maintenance | CC0 | 50 MB | `maintenance_orders` históricas | 🟡 Media |
| Wind Turbine SCADA | Libre | 100 MB | SCADA real | 🟡 Media |
| arXiv (bulk) | Varía por artículo | Bulk | RAG — `category = 'historico_falla'` | 🟡 Media |
| Paderborn Bearing | CC BY-NC | 30 GB | ML Service — complemento de CWRU (corriente) | 🟢 Baja |
| MFPT | Investigación | 5 GB | ML Service — rodamientos | 🟢 Baja |
| MIMII | CC BY 4.0 | ~10 GB | Audio (módulo futuro) | 🟢 Baja |
| Loghub (HDFS) | Investigación | 1,5 GB | Volumen de `audit_log` | 🟢 Baja |
| UCI Power | CC BY 4.0 | 20 MB | Contexto energético | 🟢 Baja |
| ASHRAE Great Energy Predictor III | Kaggle | 5 GB | HVAC | 🟢 Baja |

### Mapeo dataset → módulo

| Módulo de la app | Dataset recomendado | Uso concreto |
|---|---|---|
| ML Service — vibración | CWRU, Paderborn | Clasificación de rodamientos |
| ML Service — RUL | NASA C-MAPSS, IMS | Regresión de vida útil restante |
| ML Service — prototipado | AI4I 2020 | Entrenamiento rápido y validación |
| Ingesta de sensores | Intel Lab, SML2010 | Pipeline de lectura |
| Órdenes históricas | Mining Maintenance, Azure PdM | Volumen de `maintenance_orders` |
| SCADA | Wind Turbine SCADA | Integración real |
| RAG — normativa | OSHA, NIOSH, ISO | `kb_maintenance.category = 'normativa'` |
| RAG — manuales | SKF, ABB, Siemens | `kb_maintenance.category = 'manual'` |
| RAG — históricos | arXiv, patentes | `kb_maintenance.category = 'historico_falla'` |
| Auditoría | Loghub (HDFS) | Prueba de volumen de `audit_log` |
| Energía | UCI Power, ASHRAE | Contexto operativo |
| Simulación | Semilla propia (`07_seed_readings.sql`) | Datos de arranque |

---

## Descarga

> Los cuatro primeros son FOSS para uso de desarrollo. **Paderborn es CC BY-NC** (no
> comercial): sirve para investigar, no para un producto en producción. C-MAPSS exige un
> registro gratuito en el portal de la NASA; por eso no se puede automatizar la descarga.

```bash
mkdir -p data/datasets/{cmapss,ai4i2020,azure-pdm,cwru,osha,intel-lab,arxiv,loghub}

# AI4I 2020 (10 MB, descarga directa)
curl -L "https://archive.ics.uci.edu/static/public/601/ai4i+2020+predictive+maintenance+dataset.zip" \
  -o data/datasets/ai4i2020.zip
unzip -o data/datasets/ai4i2020.zip -d data/datasets/ai4i2020/

# Azure PdM (500 MB) — requiere aceptar la licencia en el portal de Microsoft
#   https://gallery.azure.ai/Experiment/Predictive-Maintenance-Implementation-Guide-1
#   → dejar los CSV en data/datasets/azure-pdm/

# NASA C-MAPSS (~2 GB) — registro gratuito obligatorio
#   https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/
#   → subir train_FD001.txt / test_FD001.txt / RUL_FD001.txt a data/datasets/cmapss/

# CWRU Bearing (~1 GB)
#   https://engineering.case.edu/bearingdatacenter/download-data-file
#   → data/datasets/cwru/

# OSHA (normativa pública, ya en texto o HTML)
#   https://www.osha.gov/laws-regs/regulations/standardnumber/1910
#   → data/datasets/osha/
```

## Ruta mínima (< 1 hora)

Se puede dejar el sistema funcionando con datos reales en cuatro pasos:

1. **AI4I 2020** (10 MB) → lecturas y predicciones etiquetadas.
2. **Azure PdM** (~500 MB) → equipos, sensores y órdenes de mantenimiento.
3. **NASA C-MAPSS** (~2 GB) → entrenar el RandomForest con RUL.
4. **OSHA** (gratis) → 20-30 documentos para el RAG.

Con esos cuatro, la aplicación queda alimentada, entrenable y auditable sin datos propios.

## Importación

Los importadores están en [`scripts/import/`](../scripts/import/README.md). Todos aceptan
`--dry-run` (lee y valida el fichero, informa de lo que haría y **no** toca la base).

```bash
python scripts/import/import-ai4i.py --dry-run
```
