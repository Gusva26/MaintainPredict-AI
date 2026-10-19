# Integraciones — MaintainPredict AI

Todas las comunicaciones con sistemas externos pasan por `apps/web/lib/integrations/`.
El dominio (agentes, reportes, API) **nunca** hace `fetch` directo a un proveedor: habla
contra las interfaces de `lib/integrations/types.ts`. Así, pasar de simulado a real es
solo cambiar `.env`.

```
lib/integrations/
├── types.ts        # ErpClient, ScadaClient, SmsClient, EmailClient, HealthStatus
├── support.ts      # fetchWithTimeout(), probe(), modeOf()
├── index.ts        # getIntegrations(): factoría + health() agregado
└── adapters/
    ├── http-erp.ts       # ERP      (HTTP + x-api-key) + catálogo local de respaldo
    ├── http-scada.ts     # SCADA    (HTTP + x-api-key)
    ├── mock-sms.ts       # SMS      (pasarela simulada o dry-run)
    ├── twilio-sms.ts     # SMS      (Twilio REST)
    └── smtp-email.ts     # Email    (SMTP, MailHog en desarrollo)
```

## Los 5 adaptadores

| # | Adaptador | Dominio | Modo | Cuándo se usa |
|---|---|---|---|---|
| 1 | `ErpHttpAdapter` (`erp-http`) | ERP | mock/real | Siempre. Resuelve repuestos y lead time. |
| 2 | `ScadaHttpAdapter` (`scada-http`) | SCADA | mock/real | Lecturas de telemetría en vivo. |
| 3 | `MockSmsGatewayAdapter` (`sms-mock-gateway`) | SMS | mock | `SMS_PROVIDER=mock`. |
| 4 | `TwilioSmsAdapter` (`sms-twilio`) | SMS | real | `SMS_PROVIDER=twilio`. |
| 5 | `SmtpEmailAdapter` (`email-smtp`) | Email | mock/real | Notificaciones por correo. |

`SMS_PROVIDER=log` (valor por defecto en desarrollo) usa el adaptador de la pasarela en
**dry-run** (`adapter: sms-log`): registra el mensaje en el log y no toca la red.

## Selección de adaptador

| Variable | Valores | Efecto |
|---|---|---|
| `INTEGRATIONS_MODE` | `mock` (def) · `real` | Interruptor global. En `real` avisa por log si algún adaptador sigue en modo simulado. |
| `SMS_PROVIDER` | `log` · `mock` · `twilio` | Qué adaptador de SMS se instancia. |
| `INTEGRATION_TIMEOUT_MS` | entero (def `5000`) | Corte de cada llamada externa. Un proveedor lento no bloquea la petición. |
| `ERP_BASE_URL` / `ERP_API_KEY` | URL / clave | ERP. |
| `SCADA_BASE_URL` / `SCADA_API_KEY` | URL / clave | SCADA. |
| `SMS_BASE_URL` | URL | Pasarela de SMS simulada (def `http://mock-sms:9002`). |
| `SMS_ACCOUNT_SID` / `SMS_AUTH_TOKEN` / `SMS_FROM` | credenciales | Twilio. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | credenciales | SMTP. |

## De simulado a real (producción)

1. `INTEGRATIONS_MODE=real`.
2. Sustituye las URL de los mocks por los endpoints reales:
   - `ERP_BASE_URL=https://erp.tuempresa.com` y `ERP_API_KEY=<clave real>`
   - `SCADA_BASE_URL=https://scada.tuempresa.com` y `SCADA_API_KEY=<clave real>`
3. SMS: `SMS_PROVIDER=twilio` + `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_FROM`.
4. Email: apunta `SMTP_*` a tu servidor corporativo.
5. **No se toca ni una línea de código.** Verifica con `GET /api/integrations/health`.

> El ERP real debe exponer `POST /erp/check-parts` con `{ component }` y devolver
> `{ parts: [{ sku, qty, lead_days, ... }] }`. Si expone otro contrato, adapta
> únicamente `http-erp.ts`.

## Degradación y resiliencia

- **ERP**: si el proveedor falla, `checkParts()` devuelve el catálogo local
  (`LOCAL_PARTS_CATALOG`, con `source: 'catalog'`). La planificación nunca se rompe.
- **SCADA**: `getLatestReadings()` sí lanza si el proveedor responde con error; el
  llamador decide el respaldo (las lecturas históricas de la BD siguen disponibles).
- **Timeouts**: toda llamada pasa por `fetchWithTimeout()`. Nada queda colgado.
- **Sondas**: `health()` está diseñado para **no lanzar nunca**: convierte cualquier
  excepción en `{ ok: false, detail }`.

## Observabilidad

`GET /api/integrations/health` (permiso `integrations:read`) devuelve:

```json
{
  "data": {
    "mode": "mock",
    "summary": { "total": 4, "ok": 4, "failed": [], "slowestMs": 34 },
    "adapters": [
      { "kind": "erp", "adapter": "erp-http", "mode": "mock", "ok": true, "latencyMs": 12, "checkedAt": "..." }
    ]
  },
  "explanation": { "what": "...", "how": "...", "decision": "..." }
}
```

## Mocks de desarrollo

| Servicio | Puerto | Fichero | Descripción |
|---|---|---|---|
| `mock-erp` | 9001 | `infra/mocks/erp/server.js` | Catálogo de repuestos. |
| `mock-scada` | 9000 | `infra/mocks/scada/server.js` | Telemetría simulada. |
| `mock-sms` | 9002 | `infra/mocks/sms/server.js` | Pasarela de SMS simulada. |
| `mailhog` | 1025 / 8025 | — | Buzón SMTP de captura (UI en <http://localhost:8025>). |

Prueba manual de la pasarela de SMS:

```bash
curl -s http://localhost:9002/health
curl -s -X POST http://localhost:9002/sms/send \
  -H 'content-type: application/json' \
  -d '{"to":"+34600000000","message":"Prueba"}'
curl -s http://localhost:9002/sms/messages
```

## Tests

`apps/web/tests/integrations.test.ts` cubre: degradación del ERP al catálogo, sondas que
no lanzan, SMS en dry-run, Twilio sin credenciales y el `health()` agregado de la factoría.
