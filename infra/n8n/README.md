# Workflows n8n — MaintainPredict AI

Este directorio contiene las definiciones declarativas JSON de los flujos de orquestación de negocio para MaintainPredict AI.

## Requisitos y Configuración de Infraestructura

- **Versión de n8n**: `1.62.6` (definida en `docker-compose.yml` como `n8nio/n8n:1.62.6`).
  > Nota: el tag `1.62.0` **no está publicado** en Docker Hub (la serie 1.62 empieza en `1.62.1`),
  > por eso se fija el último patch de esa serie.
  > El aviso de "nueva versión disponible" de la UI se silencia con `N8N_VERSION_NOTIFICATIONS_ENABLED=false`
  > (+ `N8N_DIAGNOSTICS_ENABLED=false` para no enviar telemetría) en ambos compose. Actualizar de versión
  > obliga a revalidar los 4 workflows (para la BD, un `pg_dump` de la base `n8n` antes).
- **Variables de Entorno necesarias en el contenedor n8n**:
  - `APP_BASE_URL`: URL interna del backend Next.js (por defecto `http://web:3000`).
  - `PUBLIC_APP_URL`: URL pública (navegador) para los enlaces de los emails (`http://localhost:3000` en local,
    `https://<APP_DOMAIN>` en prod). Si no se define, los workflows caen a `APP_BASE_URL`, que **no** es
    resoluble desde el navegador del usuario.
  - `N8N_WEBHOOK_BASE_URL`: URL interna de n8n para construir el enlace de reanudación HITL (`http://n8n:5678`).
  - `INTERNAL_TOKEN`: Token secreto compartido para autenticación entre servicios (`x-internal-token`).
  - `SENSOR_API_KEY`: API key autorizada para la ingesta de telemetría de sensores.
  - `ERP_BASE_URL`: URL base del ERP / mock (por defecto `http://mock-erp:9001`).
  - `ERP_API_KEY`: Token del mock ERP.
  - `SMTP_FROM`: Remitente por defecto para alertas (ej. `maintainpredict@local`).
  - `SUPERVISOR_EMAIL`: Correo del supervisor para aprobaciones HITL y reportes semanales.
  - `OPENAI_API_KEY`: API key del proveedor LLM que genera los resúmenes de WF-03.
  - `OPENAI_BASE_URL`: URL base del proveedor (por defecto `https://api.openai.com/v1`; en este entorno,
    `https://api.groq.com/openai/v1`). El nodo LLM de WF-03 la usa para construir el endpoint.
  - `OPENAI_CHAT_MODEL`: modelo de chat (con proveedores agregados debe llevar prefijo: `openai/gpt-oss-120b`).
  - `GEMINI_API_KEY`: opcional; habilita los embeddings del RAG. Solo los usa la app web (WF-03 no vectoriza nada).
- **Volumen de reportes**: `reports_data:/data/reports` está montado en `n8n` y en `web`. El servicio one-shot
  `reports-init` lo prepara (`chown 1000:1000`) porque el volumen se crea `root:root` y n8n corre como `node`
  (uid 1000), que si no no puede escribir los PDF/XLSX de WF-03.

## Catálogo de Workflows

| Archivo | ID | Tipo de Trigger | Descripción |
|---|---|---|---|
| `WF-01_sensor-intake.json` | WF-01 | Webhook `POST /sensor-data` | Ingesta de sensores, llamada a `/api/sensors/data`, ejecución de predicción y auto-plan si prob > 0.70. |
| `WF-02_order-generation.json` | WF-02 | Webhook `POST /generate-order` | Generación de orden preventiva, verificación en ERP y Human-in-the-Loop (HITL) con espera de aprobación si parada > 4h. |
| `WF-03_weekly-report.json` | WF-03 | Cron semanal (`0 8 * * 1`) + Manual Trigger | Recopilación de métricas, generación de reportes JSON/PDF/XLSX, resumen con LLM y envío a supervisores. |
| `WF-04_metrics-sync.json` | WF-04 | Cron cada 6 horas + Manual Trigger | Sincronización de métricas de ML, detección de falsos positivos, escaneo de datos sucios y detección de drift. |

> Los workflows con cron (WF-03/04) llevan además un **Manual Trigger** para poder lanzarlos bajo demanda desde
> la UI (*Execute workflow*) o desde la CLI, ya que `n8n execute` solo acepta disparadores manuales
> (si no, falla con `Missing node to start execution`).

## Proceso de Importación

Para importar automáticamente todos los workflows en una instancia n8n en ejecución:

```bash
export N8N_URL=http://localhost:5678
export N8N_API_KEY=tu_api_key_de_n8n
bash infra/n8n/import.sh
```

> **Alternativa sin API key.** Los workflows ya están montados dentro del contenedor n8n
> (`./infra/n8n/workflows:/workflows:ro`), así que se pueden importar con su propia CLI:
>
> ```bash
> docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
> ```
>
> ⚠️ **Nota (n8n 1.62).** El importador de la CLI **no reutiliza una tag repetida entre workflows**: si dos
> definen la misma tag falla con `duplicate key value violates unique constraint` sobre `tag_entity.name` y
> revierte todo. Por eso cada workflow lleva solo su tag propia (`wf-01`…`wf-04`) y se retiró la común
> `maintainpredict`. Si quieres una tag agrupadora, añádela después desde la UI.
>
> ✅ **Reimportar es idempotente.** Cada JSON lleva su `id` de n8n, así que el *upsert* por `id` **actualiza en
> sitio** (no duplica) y conserva proyecto y tags. Tras reimportar, reactiva y reinicia:
>
> ```bash
> docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
> docker compose exec -T n8n n8n update:workflow --all --active=true
> docker compose restart n8n
> ```
>
> Si alguna vez se importa un JSON **sin** `id`, sí se crea un workflow nuevo con otro id: en ese caso hay que
> borrar las filas viejas de `workflow_entity` (y `execution_entity`, `webhook_entity`) antes de reimportar.

Alternativamente, se pueden importar manualmente a través de la UI web de n8n en **Workflows → Import from File**.

## Credenciales

Los workflows referencian tres credenciales de n8n (por `id` y nombre):

| Credencial | Tipo | La usan | Contenido local |
|---|---|---|---|
| `mp_smtp` | `smtp` | WF-01…04 | MailHog: `host=mailhog`, `port=1025`, `secure=false`, sin usuario |
| `mp_postgres` | `postgres` | WF-02 | BD `maintainpredict` (`postgres:5432`) |
| `mp_openai` | `openAiApi` | WF-03 | `OPENAI_API_KEY` (API compatible OpenAI; el nodo HTTP fija la URL base) |

La de correo (sin secretos) está versionada en `infra/n8n/credentials/smtp.json` y se importa así — la CLI
cifra el `data` plano con la `N8N_ENCRYPTION_KEY` del contenedor:

```bash
docker compose exec -T n8n sh -c 'cat > /tmp/smtp.json' < infra/n8n/credentials/smtp.json
docker compose exec -T n8n n8n import:credentials --input=/tmp/smtp.json
```

`postgres` y `openAiApi` contienen secretos ⇒ **no se versionan**. Se generan desde el `.env` y se importan con
el script incluido:

```bash
bash infra/n8n/import-credentials.sh
```

> El script crea `mp_postgres` (host `postgres`, BD `maintainpredict`, `ssl=disable`) y `mp_openai`
> (`OPENAI_API_KEY`) leyendo los valores de `.env`; también funciona en Git Bash (desactiva la conversión de
> rutas de MSYS). Alternativa manual: crearlas desde la UI (**Credentials → Add credential**).

## Activación

```bash
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n      # n8n avisa: la activación no surte efecto en caliente
```

Sin el reinicio, n8n no registra los triggers y los webhooks devuelven 404.

## Pruebas E2E (validadas el 2026-10-18)

### WF-01 — ingesta de sensores

```bash
curl -X POST http://localhost:5678/webhook/sensor-data \
  -H 'content-type: application/json' \
  -d '{"sensor_id": 2, "value": 10.7}'
```

Respuesta esperada `200 { "ok": true, "prediction": { … } }`. Si `failure_probability > 0.7` se crea una orden
y el aviso llega a MailHog (`http://localhost:8025`).

### WF-02 — generación de orden (auto y HITL)

```bash
# prediction_id con prob < 0.85 y equipo no crítico → orden auto-aprobada (parada 2.5h)
curl -X POST http://localhost:5678/webhook/generate-order \
  -H 'content-type: application/json' -d '{"prediction_id": 154}'
# → 200 {"ok":true,"order":{ "order_id": …, "requires_hitl": false, … }}

# prediction_id con prob > 0.85 (o equipo crítico) → parada > 4h ⇒ HITL (pide aprobación al supervisor)
curl -X POST http://localhost:5678/webhook/generate-order \
  -H 'content-type: application/json' -d '{"prediction_id": 130}'
```

En la rama HITL el email del supervisor lleva un enlace `…/orders/<id>?resume=http://n8n:5678/webhook-waiting/<eid>`.
Al aprobar en la UI (o vía `POST /api/orders/<id>/approve?resume=…`) el workflow reanuda la espera y notifica al
técnico.

> ⚠️ **El Wait espera hasta 30 min** (`limitWaitTime`). Como el webhook usa `responseMode: responseNode`, en la
> rama HITL la respuesta HTTP no llega hasta que se aprueba o expira: un cliente HTTP debe usar un timeout corto
> o no bloquear. Si expira, se envía el aviso «HITL expirado».
> El nodo Wait **debe** reanudarse por `POST /webhook-waiting/<executionId>`: no admite `webhookSuffix` (rompe el
> enrutado) y su `httpMethod` está fijado a `POST`.

### WF-03 — reporte semanal (cron lunes 08:00)

```bash
docker compose exec -T n8n n8n execute --id=2kDq2Dn152FFO7pe
```

Genera `weekly_<inicio>_<fin>.pdf` y `.xlsx` en el volumen `reports_data` (`/data/reports`), envía el email al
supervisor con el PDF adjunto y las alertas destacadas. Si el LLM falla, el nodo de resumen sintético
(`onError: continueRegularOutput`) mantiene el flujo verde.

### WF-04 — sincronización de métricas (cron cada 6h)

```bash
docker compose exec -T n8n n8n execute --id=6sAtitcvR5cxiwo2
```

Sincroniza métricas del modelo y KPIs, detecta falsos positivos y datos sucios (`POST /api/observability/metrics/sync`
con `x-internal-token`) y avisa por email si hay alertas de salud del modelo. El nodo «escaneo datos sucios
dedicado» es una rama paralela solo-reporte: no bloquea el flujo principal.
