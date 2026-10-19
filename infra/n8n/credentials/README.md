# Credenciales n8n — MaintainPredict AI

Para que los workflows funcionen sin errores en n8n, se deben configurar las siguientes credenciales en la interfaz de n8n (**Settings → Credentials → New**):

| `id` | Nombre de Credencial | Tipo en n8n | Parámetros recomendados | Utilizado en |
|---|---|---|---|---|
| `mp_postgres` | `MaintainPredict Postgres` | Postgres | `host=postgres`, `port=5432`, `database=maintainpredict`, `user=${POSTGRES_USER}`, `password=${POSTGRES_PASSWORD}`, `ssl=disable` | WF-02 |
| `mp_smtp` | `MaintainPredict SMTP` | SMTP | `host=mailhog`, `port=1025`, `user=` (vacío), `password=` (vacío), `fromEmail=${SMTP_FROM}` | WF-01, WF-02, WF-03, WF-04 |
| `mp_openai` | `MaintainPredict OpenAI` | OpenAI | `apiKey=${OPENAI_API_KEY}` (API compatible OpenAI; la URL base la fija el nodo de WF-03 con `OPENAI_BASE_URL`) | WF-03 |

> El `id` es lo que referencian los JSON de los workflows; el nombre es solo cosmético en la UI.

> [!NOTE]
> En entornos de producción (`docker-compose.prod.yml`), reemplace los parámetros de `MaintainPredict SMTP` por el servidor SMTP corporativo (ej: SendGrid, Amazon SES o Mailgun) con autenticación TLS/SSL obligatoria.

## Importación con la CLI (recomendado)

Los `id` de las credenciales están fijados en los workflows, así que deben coincidir exactamente:
`mp_smtp`, `mp_postgres` y `mp_openai`.

```bash
# SMTP (MailHog, sin secretos): versionada en este directorio
docker compose exec -T n8n sh -c 'cat > /tmp/smtp.json' < infra/n8n/credentials/smtp.json
docker compose exec -T n8n n8n import:credentials --input=/tmp/smtp.json

# Postgres + OpenAI: llevan secretos, se generan desde el .env
bash infra/n8n/import-credentials.sh
```

Comprobación:

```sql
select id, name, type from credentials_entity order by id;
-- mp_openai | MaintainPredict OpenAI   | openAiApi
-- mp_postgres | MaintainPredict Postgres | postgres
-- mp_smtp   | MaintainPredict SMTP     | smtp
```
