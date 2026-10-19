# Guía de resolución de problemas — MaintainPredict AI

Esta guía recoge **fallos que han ocurrido de verdad** en este proyecto, con la causa concreta y la solución que
funcionó. No es una lista de errores genéricos de Docker: cuando algo aquí dice «era X», es porque X pasó y se
diagnosticó.

> **Convención de rutas.** Los comandos están escritos para ejecutarse desde la raíz del repositorio. En Windows,
> `bash` de PowerShell apunta a WSL; usa Git Bash:
> `& "C:\Program Files\Git\bin\bash.exe" scripts/smoke-test.sh`.

---

## 0. Diagnóstico en 60 segundos

Antes de buscar el síntoma concreto, estas cinco órdenes acotan casi cualquier problema:

```bash
docker compose ps                     # ¿está todo "Up" y "healthy"? ¿algún RestartCount > 0?
docker compose logs --tail=80 web     # el error real suele estar en la última traza
curl -s http://localhost:3000/api/health
bash scripts/smoke-test.sh            # 27 comprobaciones de API
bash scripts/check-links.sh           # 80 comprobaciones de rutas × rol
```

| Señal | Significa |
|---|---|
| `RestartCount` subiendo en `mp_web` | El proceso muere al arrancar: casi siempre un import o una variable obligatoria |
| `unhealthy` en `postgres` | Credenciales o volumen corrupto, no la aplicación |
| `web` arriba pero `/api/health` falla | La app arrancó sin poder hablar con Postgres |
| Humo en verde y navegador roto | Es de interfaz (caché del service worker, permisos de rol o una página concreta) |
| Humo en rojo con 401 | Sesión/token, no lógica de negocio |

---

## 1. Arranque y contenedores

### 1.1 `web` reinicia en bucle y el log muere en un import

**Síntoma.** `docker compose ps` muestra `Restarting`; el log corta en `Cannot find module ...` o en un error de
resolución de `@/...`.

**Causa.** El `node_modules` del contenedor está incompleto o es de otra arquitectura. En un monorepo pnpm, **el
paquete `apps/web` tiene su propio `node_modules`**; si el volumen anónimo o el `COPY` no lo incluye, faltan
dependencias aunque la raíz las tenga.

**Solución.**

```bash
docker compose down
docker compose up -d --build --force-recreate
```

Si persiste, comprueba que `.dockerignore` excluye `**/node_modules` y `**/.next` (si no, el contexto de build
arrastra binarios del host y sobrescribe los del contenedor). El `Dockerfile` debe copiar los manifiestos del
workspace **antes** de instalar.

> **Regla práctica:** un cambio en `middleware.ts` o en una página lo recoge `docker compose restart web`. Un
> **fichero nuevo** (ruta, componente, script) exige `docker compose up -d --force-recreate web`, porque el
> `standalone` de Next se generó con el árbol anterior.

### 1.2 `Cannot find module 'dotenv'` al sembrar

**Síntoma.** `pnpm db:seed:users` o el seed de la KB fallan con `ERR_MODULE_NOT_FOUND: dotenv`.

**Causa.** Los scripts de seed lo importan, pero no estaba declarado en `apps/web/package.json` (solo en la raíz).

**Solución.** Está corregido; si reaparece, añade `dotenv` a las dependencias de `apps/web` y reinstala. Los seeds
se ejecutan **dentro** del contenedor:

```bash
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/seed-users.ts'
```

### 1.3 Los mocks no arrancan

**Síntoma.** `mock-erp`, `mock-scada` o `mock-sms` en `Restarting`.

**Causa.** Los mocks son paquetes del workspace con su propio `node_modules`; el volumen de dependencias no estaba
definido para ellos.

**Solución.** Ya están definidos en `docker-compose.yml`. Si editas un mock, recrea solo ese servicio:
`docker compose up -d --build mock-erp`.

### 1.4 Todo arranca pero los puertos no responden

**Síntoma.** `localhost:3000` no abre nada.

**Causa.** En desarrollo los puertos se publican; en producción **solo Caddy publica 80/443** y `web` es interno.
Estás mirando el compose equivocado.

**Solución.** En producción entra por `https://<APP_DOMAIN>`, no por `:3000`. Para depurar:
`docker compose -f docker-compose.prod.yml exec web wget -qO- http://localhost:3000/api/health`.

---

## 2. Base de datos

### 2.1 `password authentication failed for user "mp_user"`

**Síntoma.** Postgres rechaza la conexión aunque `.env` «está bien».

**Causa.** El volumen de Postgres ya existía con la contraseña anterior. **Los scripts de `init/` solo se ejecutan
en el primer arranque con el volumen vacío**; cambiar `POSTGRES_PASSWORD` no actualiza el usuario existente.

**Solución.** Elige una:

```bash
# A) Conservar datos: cambiar la contraseña dentro del contenedor
docker compose exec -T postgres psql -U mp_user -d postgres -c "ALTER USER mp_user WITH PASSWORD 'nueva';"

# B) Empezar de cero (DESTRUCTIVO)
bash scripts/backup-db.sh                 # primero, siempre
FORCE=1 bash scripts/reset-db.sh
```

Y recuerda que `DATABASE_URL` debe llevar la **misma** contraseña; es la que usa la aplicación.

### 2.2 La aplicación no ve las tablas

**Síntoma.** `relation "equipment" does not exist`.

**Causa.** El volumen se creó, pero el contenedor de Postgres arrancó antes de que se copiaran los `init/*.sql`, o
se recreó la base sin volver a aplicarlos.

**Solución.**

```bash
FORCE=1 bash scripts/reset-db.sh          # vuelve a aplicar init/ en orden alfabético
```

`reset-db.sh` hace `DROP DATABASE ... WITH (FORCE)`, recrea y aplica **todos** los scripts de
`infra/postgres/init/` en orden alfabético; después siembra usuarios y vectoriza la KB. Con `SKIP_KB=1` omite el
seed de la KB (útil sin clave de embeddings).

### 2.3 El reset se queda colgado

**Causa.** Hay conexiones abiertas (n8n, web, tu propia sesión de `psql`).

**Solución.** El script ya usa `WITH (FORCE)`. Si aun así falla, para los clientes primero:

```bash
docker compose stop web n8n
FORCE=1 bash scripts/reset-db.sh
docker compose start web n8n
```

### 2.4 Restaurar una copia

```bash
bash scripts/backup-db.sh                                  # crea .sql.gz con marca de tiempo
ls infra/postgres/backups/
bash scripts/restore-db.sh infra/postgres/backups/maintainpredict_20261018_120000.sql.gz
```

`backup-db.sh` vuelca **dos** bases: la de la aplicación y la de n8n (las credenciales y los workflows viven ahí).
`restore-db.sh` **sobrescribe** la base actual y no pregunta.

> **Trampa real:** los volcados de n8n no deben restaurarse con un `n8n` en marcha; para ese servicio, para el
> contenedor, restaura y arráncalo.

---

## 3. Autenticación y sesión

### 3.1 Login correcto y vuelta inmediata a `/login`

**Causa más frecuente.** El `middleware` redirige a `/login?next=...`, y si el destino no está permitido para el
rol, vuelve a redirigir. Un técnico que entra a `/reports` **debe** acabar fuera: es el comportamiento correcto.

**Comprobación.** Mira la URL: si `next` apunta a una ruta que ese rol no tiene, no es un fallo de sesión.

### 3.2 El login devuelve 500 en lugar de 401

**Causa histórica (real).** El endpoint hacía `await req.json()` sin protección: un cuerpo vacío o no-JSON
lanzaba una excepción que `handleError` convertía en **500**, cuando lo correcto era un error de cliente.

**Solución.** Es el patrón que usa todo el proyecto:

```ts
const body = Body.parse(await req.json().catch(() => ({})));   // Zod → 422 si no encaja
```

Zod convierte el caso malo en **422 con el campo exacto**, y el 500 queda para lo que de verdad es un fallo del
servidor.

> **Segundo riesgo, del mismo tipo.** Un `redirect()` o un `notFound()` de Next lanzados **dentro de un
> `try/catch`** se capturan como si fueran errores (`NEXT_REDIRECT` / `NEXT_NOT_FOUND`) y `handleError` los
> convierte en 500. Si necesitas el `try`, vuelve a lanzarlos:
>
> ```ts
> catch (e: any) {
>   if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
>   return handleError(e);
> }
> ```

### 3.3 `useSearchParams() should be wrapped in a suspense boundary`

**Síntoma.** El build falla o la página devuelve 500.

**Causa.** Next 14 exige un límite de `Suspense` para cualquier componente cliente que use `useSearchParams()`.

**Solución.** Envuelve el componente (así está `LoginForm` en `app/(auth)/login/page.tsx`).

> **No lo confundas con `loading.tsx`.** Un `loading.tsx` en `app/` o en `(dashboard)/` crea un límite de
> `Suspense` que hace que Next envíe **200 antes** de resolver la página, y entonces `notFound()` ya no puede
> devolver 404. Por eso este proyecto **no tiene** `loading.tsx` en esas carpetas (decisión G.7); el único está
> en `app/technician/loading.tsx`.

### 3.4 Un 404 se convierte en 200 con pantalla vacía

**Causa.** Falta la comprobación de existencia en servidor. Una ficha con un id inventado se renderiza con datos
vacíos.

**Solución.** Usa `lib/db/detail-guard.ts` (ya aplicado en equipos, predicciones y órdenes). El patrón es
`const row = await getX(id); if (!row) notFound();`.

### 3.5 El enlace del correo HITL lleva a `/login` y al volver se pierde la decisión

**Causa histórica.** El `middleware` guardaba solo la ruta en `next`, sin la query string, así que `resume` y
`decision` desaparecían.

**Solución.** Corregido: `redirectOr401` conserva **ruta + query**. Si lo tocas, comprueba con:

```bash
curl -sI "http://localhost:3000/orders/1?resume=abc&decision=reject" | grep -i location
# debe incluir next=%2Forders%2F1%3Fresume%3Dabc%26decision%3Dreject
```

### 3.6 Entro con un usuario y veo datos de otro rol

**Causa.** Sesión antigua en la cookie. El JWT lleva el rol dentro y **no se revalida contra la base de datos**
(brecha B4 de `docs/SEGURIDAD.md`), así que un cambio de rol tarda como máximo 8 h en notarse, o 7 días si se
renueva el refresh.

**Solución inmediata.** Cerrar sesión y volver a entrar; si hace falta forzar a todos, rotar `JWT_SECRET` y
recrear `web`.

### 3.7 `curl` devuelve 401 aunque el login funcione

**Causa.** `curl` descarta cookies de hosts de una sola etiqueta (`web`) por considerarlos no válidos.

**Solución.** No uses `-c/-b` con `http://web:3000`; envía la cabecera explícita:

```bash
curl -s -H "Cookie: mp_access=$TOKEN" http://web:3000/api/orders
```

Así lo hace `scripts/smoke-test.sh`, y está comentado en su cabecera.

---

## 4. Agentes de IA, LLM y RAG

### 4.1 `404 model_not_found` del proveedor

**Causa.** El modelo configurado no existe en ese proveedor. Caso real: `llama-3.3-70b-versatile` devolvía 404 en
el endpoint usado.

**Solución.** Ajusta `OPENAI_CHAT_MODEL` al modelo real del proveedor. Configuración validada de este proyecto:

| Proveedor | `OPENAI_BASE_URL` | Modelo |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o` |
| OpenAI | *(vacío)* | `gpt-4o-mini` |

### 4.2 El RAG falla con dimensiones

**Síntoma.** `expected 1536 dimensions, not N` al insertar o buscar embeddings.

**Causa.** La columna `vector(1536)` es fija y el modelo de embeddings devuelve otra dimensión. Además, **Groq no
ofrece embeddings**, así que no sirve para esta parte aunque sí para el chat.

**Solución.** Usa un proveedor de embeddings de 1536 dimensiones (`gemini-embedding-001` o
`text-embedding-3-small`) y revectoriza:

```bash
docker compose exec -T web sh -lc \
  'cd /app/apps/web && ./node_modules/.bin/tsx scripts/seed-kb-embeddings.ts'
```

### 4.3 El planner tarda una eternidad o corta

**Causa.** Timeout del proveedor o reintentos acumulados.

**Solución.** Ajusta `LLM_TIMEOUT_MS`, `AGENT_TIMEOUT_MS` y `AGENT_RETRIES` en `.env` y recrea `web`. El planner no
se reintenta (un reintento duplicaría el coste); el servicio ML sí, con retroceso. Si el LLM no responde, debe
aparecer el **plan de respaldo determinista**, no un error 500.

### 4.4 La predicción sale sin fuentes RAG

**Causa.** La KB no está vectorizada, o el proveedor de embeddings falló y se degradó sin fuentes.

**Solución.** Revectoriza (4.2) y comprueba `predictions.features.rag_sources`; si está vacío, revisa
`GEMINI_API_KEY`/`OPENAI_API_KEY` y los logs de `web`.

### 4.5 El plan propone algo que el sistema luego rechaza

**Causa.** El LLM propone y **el código sella** (`sealDraftOrder`/`sealPlannerOutput`): umbral de HITL, técnico y
ventana válidos. Que el resultado no coincida con lo que «dijo» el modelo es el diseño correcto, no un fallo.

**Qué mirar.** El `explanation.decision` de la respuesta y las notas de la orden; ahí queda por qué se selló así.

---

## 5. n8n y workflows

### 5.1 Los webhooks dan 404 tras importar

**Causa.** n8n registra los webhooks al arrancar. Importar no basta.

**Solución.** Siempre, en este orden:

```bash
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n
```

### 5.2 WF-01 llega pero el sensor es `undefined`

**Causa histórica.** El nodo leía `$json.sensorId` cuando el dato venía en `$json.data.sensorId`, y acababa
llamando a `GET /api/sensors/undefined` → 404.

**Solución.** Corregido. Al tocar un workflow, dispara una ingesta real y mira el cuerpo que devuelve el
`Respond to Webhook` antes de dar por bueno el cambio.

### 5.3 El HITL nunca se reanuda (404 al aprobar)

**Causa real, doble.** El nodo `Wait` tenía `options.webhookSuffix`, y eso **rompe** la ruta de reanudación
(`/webhook-waiting/<executionId>`: n8n intenta parsear el sufijo como id → `invalid input syntax for type integer:
"NaN"` o 404). Además, sin `httpMethod`, el `Wait` espera **GET**, y el backend llama con **POST**.

**Solución.** En el nodo `Wait`: **sin** `webhookSuffix`, `httpMethod: POST` y `limitWaitTime` real (30 min). El
backend debe enviar el `resumeUrl` **completo** que devuelve n8n; si reconstruye la URL a mano, no reanuda.

### 5.4 Una expresión de n8n se envía literal (`{{ $json.x }}`)

**Causa.** En n8n, **todo parámetro con una expresión debe empezar por `=`**. Sin el prefijo, el texto viaja tal
cual. Ocurrió con el `html` del correo de rechazo: el usuario recibía `{{ ... }}` en pantalla.

**Solución.** Revisa el JSON del workflow: cualquier `"html": "{{ ... }}"` debe ser `"html": "={{ ... }}"`. El
proyecto incluye un escáner que cuenta los parámetros con `{{ }}` y los que no llevan `=` (deben ser 0).

> **No edites los workflows a mano.** Llevan JavaScript y HTML embebidos; parsea el JSON, muta el campo y
> reserializa. Editar con un editor de texto rompe los escapes.

### 5.5 El correo HITL no llega

| Causa | Comprobación | Solución |
|---|---|---|
| Destinatario mal | `SUPERVISOR_EMAIL` | Debe ser una cuenta real con `orders:approve` |
| MailHog vacío | `http://localhost:8025` | En desarrollo **todo** el correo va a MailHog, no a Internet |
| SMTP mal en producción | `SMTP_HOST/PORT/USER/PASS` | Probar con `GET /api/integrations/health` |
| Enlaces a `http://web:3000` | `PUBLIC_APP_URL` | Debe ser la URL pública (`http://localhost:3000` en dev, `https://<dominio>` en prod); `APP_BASE_URL` es la interna y no vale para el navegador |

> MailHog guarda el HTML en *quoted-printable* (`=` → `=3D`) y el asunto en *encoded-word*. Para buscar un enlace,
> descodifica antes; `scripts/e2e-hitl.mjs` ya lo hace.

### 5.6 Apruebo y la orden no cambia

**Comprobaciones, en orden:**

1. **Estado:** solo se aprueba/rechaza desde `pending_approval`; si está `planned`, `cancelled` o `completed`, la
   API responde **409**.
2. **Expiración:** el `Wait` caduca a los 30 min; después n8n manda el correo de expiración y la orden ya no se
   puede resolver por el enlace.
3. **Auditoría:** si hay `approve_order`, la API sí ejecutó; el problema está en la interfaz. Si no hay entrada,
   la petición no llegó (mira el `resume` y el `Wait`, 5.3).
4. **Rol:** el usuario debe tener `orders:approve` (técnico **no**).

```sql
SELECT order_id, status FROM maintenance_orders WHERE order_id = 159;
SELECT action, module, created_at FROM audit_log
 WHERE entity_type = 'order' AND entity_id = '159' ORDER BY audit_id;
```

> `audit_log.entity_id` es texto y se comparte entre tipos de entidad: filtra también por `entity_type`, o verás
> la predicción con el mismo número.

### 5.7 Una ejecución se queda en `waiting`

```sql
SELECT count(*) FROM execution_entity WHERE status = 'waiting';
```

Es normal mientras el HITL está abierto (hasta 30 min). Si quedó colgada de una prueba, se puede borrar desde la
UI de n8n o dejarla expirar; no afecta al resto. **No hay que reiniciar nada.**

### 5.8 Las credenciales de n8n no se descifran

**Causa.** Se cambió `N8N_ENCRYPTION_KEY` después del primer arranque.

**Solución.** Restaura la clave original (está en la copia de `.env`); si se perdió, las credenciales hay que
volver a introducirlas. Por eso la clave se respalda junto con la base `n8n`.

---

## 6. Reportes (PDF / Excel / Word)

### 6.1 El PDF devuelve 500 y el log dice `ENOENT ... Helvetica.afm`

**Causa.** `pdfkit` lee sus fuentes `.afm` desde `node_modules` en tiempo de ejecución; si webpack lo empaqueta, no
las encuentra (`vendor-chunks/data/Helvetica.afm`).

**Solución.** Ya está en `next.config.mjs`:

```js
experimental: { serverComponentsExternalPackages: ['pdfkit'] }
```

Si reaparece tras actualizar Next, comprueba que esa línea sigue ahí y que el `Dockerfile.prod` copia
`node_modules` de `pdfkit`.

### 6.2 El informe sale vacío

**Causa.** La consulta no devuelve filas para ese rango, o el `REPORTS_OUTPUT_DIR` no es escribible.

**Solución.** Prueba el mismo rango por API (`GET /api/reports/...`) y revisa el volumen de reportes. En el compose
hay un servicio `reports-init` que prepara el directorio con los permisos correctos; si no se ejecutó,
`docker compose up -d reports-init`.

### 6.3 El informe abre pero los gráficos no salen

**Causa.** El generador de PDF es el único que hace *streaming* (decisión D7 del proyecto); los de Excel y Word
construyen el documento en memoria. Si el proceso se queda corto de memoria con muchos datos, el documento puede
salir incompleto sin error.

**Solución.** Acota el rango del informe. Si el volumen es el problema real, es una limitación conocida y no un
fallo puntual de esa petición.

---

## 7. Integraciones (ERP, SCADA, SMS, email)

### 7.1 Todo cae al modo degradado

**Causa.** `INTEGRATIONS_MODE` no coincide con el entorno, o las URL apuntan a servicios que no existen.

**Solución.**

```bash
docker compose exec -T web sh -lc 'wget -qO- http://localhost:3000/api/integrations/health'
```

| Modo | Adaptadores que se esperan |
|---|---|
| `mock` (dev) | `erp-http`, `scada-http`, `sms-mock-gateway`, `email-smtp` |
| `real` (prod) | `erp-http`, `scada-http`, `sms-twilio` o el configurado, `email-smtp` |

Si el ERP real falla, **el planner no se bloquea**: usa `LOCAL_PARTS_CATALOG` y lo indica. Que el repuesto salga
del catálogo local no es un fallo del planner.

### 7.2 El SMS no sale

- **Modo mock:** no hay SMS real; se escribe en el log y en `mock-sms` (consulta su endpoint).
- **Modo real:** `SMS_PROVIDER=twilio` exige `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN` y `SMS_FROM`; sin ellos el
  adaptador falla y la orden se crea igualmente (la notificación no bloquea).
- **Móvil del técnico vacío:** no hay destino; revisa `users.phone`.

### 7.3 Timeout contra ERP/SCADA

Ajusta `INTEGRATION_TIMEOUT_MS`. Los adaptadores tienen su propio corte para no arrastrar al planner; si subes el
timeout, súbelo sabiendo que el planner espera como máximo `AGENT_TIMEOUT_MS`.

---

## 8. Servicio ML

### 8.1 `ml-service` no llega a healthy

```bash
docker compose logs --tail=80 ml-service
docker compose exec -T ml-service wget -qO- http://localhost:8000/health
```

Causas habituales: falta un artefacto del modelo (`models/*.joblib` está en `.gitignore`, así que **no viaja en el
clon**), o el contenedor no tiene `ML_SERVICE_API_KEY` y rechaza las llamadas.

### 8.2 La predicción devuelve el plan de respaldo

**Causa.** El servicio ML no respondió tras los reintentos (`AGENT_RETRIES`). Es degradación prevista: la
predicción se genera con la explicación de respaldo.

**Solución.** Recupera el ML (8.1) y vuelve a lanzar. La predicción degradada queda registrada como tal, no se
borra.

### 8.3 Reentrenar no cambia nada

El reentrenamiento pertenece a la **fase F** (LSTM/SHAP) y **no está implementado** todavía. Si un documento
promete reentrenamiento automático, ese documento está mal: es una de las brechas abiertas de
`docs/PLAN_CIERRE_BRECHAS.md`.

---

## 9. Interfaz y PWA

### 9.1 Tras desplegar sigo viendo la versión antigua

**Causa.** El service worker sirve de caché (`apps/web/public/sw.js`, constante `CACHE = 'mp-v1'`). Los assets son
*cache-first*; si no cambia la versión, no se invalida.

**Solución.** Sube la constante (`mp-v2`), despliega y recarga. En el móvil puede hacer falta cerrar la pestaña.
Está explicado en `docs/PWA.md`.

### 9.2 En consola aparece un 404 de `/.well-known/appspecific/com.chrome.devtools.json`

**Causa.** Es una sonda automática de Chrome DevTools, no de la aplicación.

**Solución.** Ignórala. No es un enlace roto; `scripts/check-links.sh` solo prueba rutas reales de la app.

### 9.3 Un enlace del menú da 404

**Causa histórica.** Había enlaces a rutas que no existen (p. ej. `/technician/checklists`) y otros con un permiso
distinto al de la ruta de destino.

**Solución.** Ejecuta `bash scripts/check-links.sh`: recorre 17 rutas × 3 roles y verifica que ninguna responde
404 y que el permiso aplicado es el esperado.

### 9.4 Un técnico ve el menú de administración

**Causa.** El enlace no está condicionado por permiso, o la ruta no tiene regla en el `middleware`.

**Solución.** Añade el permiso en `lib/auth/rbac.ts`, la regla en `middleware.ts` y el filtro en el menú
(`useRbac`). El servidor seguirá protegiendo los datos aunque el enlace aparezca, pero la coherencia se comprueba
con `check-links.sh`.

### 9.5 El formulario de login me redirige a un dominio externo

**Causa histórica (cerrada 19/10/2026).** El parámetro `next` se aceptaba sin validar (redirección abierta).

**Solución.** `LoginForm` solo acepta rutas internas (`/^\/[^/\\]/`). Si añades otro punto de redirección,
reutiliza esa validación; no la dupliques con otra más laxa.

---

## 10. Backend y base de código

### 10.1 `tsc --noEmit` falla solo en el contenedor

Ejecútalo **dentro**, que es donde están las dependencias reales:

```bash
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsc --noEmit'
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/vitest run'
```

En el host puede haber otro TypeScript o faltar `node_modules`; un error que solo sale en el host no es un error
del proyecto.

### 10.2 Vitest falla con «multiple elements» o «not wrapped in act»

**Causa.** No hay limpieza automática de Testing Library (el proyecto no usa `globals`). Un test que consulta el
DOM global arrastra el render del anterior.

**Solución.** Llama a `cleanup()` en el `afterEach` del fichero, o usa `render` con consultas `within(...)`.

### 10.3 Un `Date` como parámetro de SQL crudo revienta

**Síntoma real.** `ERR_INVALID_ARG_TYPE` al ejecutar `db.execute(sql\`...\`)` con un parámetro `Date`. Ocurrió en
`lib/observability/dirty-data.ts` y `lib/observability/kpis.ts`.

**Causa.** El driver de Postgres no serializa un objeto `Date` en una consulta cruda.

**Solución.** Pasa la fecha como ISO string (`.toISOString()`), que es como quedó corregido. Como alternativa, usa
el constructor de Drizzle con la columna tipada. En este proyecto **no hay `sql.raw`**: si aparece uno con
interpolación de variables, es una inyección SQL esperando a ocurrir.

### 10.4 Un handler anidado devuelve 404

**Causa.** En el App Router, la ruta la define la **carpeta**, no el nombre del fichero. `POST
/api/equipment/:id/sensors` exige `app/api/equipment/[id]/sensors/route.ts`, no `app/api/equipment/sensors/route.ts`
con un parámetro.

**Solución.** Comprueba la estructura de carpetas y que el método exportado (`GET`, `POST`…) sea el que llama el
cliente.

### 10.5 Un endpoint interno responde 401 desde n8n

**Causa.** `INTERNAL_TOKEN` distinto entre `.env` del host, el contenedor `web` y las credenciales de n8n.

**Solución.** Compara los tres valores. Ojo: el código tiene un **valor por defecto** para este token (brecha B2
de `docs/SEGURIDAD.md`), así que un 401 significa que ninguno de los dos lados usa el valor del `.env`, no que
falte la cabecera.

---

## 11. Rendimiento

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `/orders` tarda segundos | Muchas filas sin índice por `status`/`created_at` | Revisa `EXPLAIN ANALYZE`; los índices están en `infra/postgres/init/` |
| La ingesta se frena con 429 | Límite de 600 req/min por clave (en memoria) | Es intencionado; sube el límite o reparte claves |
| El planner tarda > 30 s | LLM lento o reintentos | Baja `LLM_TIMEOUT_MS`; el planner no debe reintentar |
| El primer informe tarda mucho | Generación en frío (fuentes, plantilla) | El segundo ya es rápido; no es una fuga |
| Uso de memoria creciente en `web` | Caché en memoria (`sensor-auth`, RAG) | Reinicia y mide; si crece sin techo, es un bug |

**Medición rápida:**

```bash
docker stats --no-stream
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
```

---

## 12. Códigos HTTP de la API

Todos los errores tienen la forma `{ "error": "...", "details": ... }` y los éxitos `{ "data": ..., "explanation": ... }`.

| Código | Cuándo lo devuelve este proyecto | Qué mirar |
|---|---|---|
| **200 / 201** | Operación correcta / recurso creado | — |
| **400** | Parámetro inválido (p. ej. id no positivo) | El id de la URL |
| **401** | Sin sesión, token caducado, credenciales malas o falta `x-internal-token` | Cookies, `INTERNAL_TOKEN`, `x-sensor-key` |
| **403** | Sesión válida sin el permiso | `lib/auth/rbac.ts` y el rol del JWT |
| **404** | Recurso inexistente o ruta mal escrita | `detail-guard`, estructura de carpetas |
| **409** | Estado incompatible (aprobar una orden que no está `pending_approval`) | `SELECT status FROM maintenance_orders` |
| **422** | Validación Zod | `details` trae el campo exacto |
| **429** | Límite de ingesta superado | `lib/http/sensor-auth.ts` |
| **500** | Excepción no controlada | `docker compose logs web`; **nunca** se devuelve la traza al cliente |

---

## 13. Referencia rápida de comandos

```bash
# Estado y logs
docker compose ps
docker compose logs -f --tail=100 web
docker compose logs -f --tail=100 n8n

# Recrear tras añadir ficheros
docker compose up -d --force-recreate web

# Calidad
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsc --noEmit'
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/vitest run'
& "C:\Program Files\Git\bin\bash.exe" scripts/smoke-test.sh
& "C:\Program Files\Git\bin\bash.exe" scripts/check-links.sh
node scripts/e2e-hitl.mjs approve      # E2E real del HITL
node scripts/e2e-hitl.mjs reject

# Datos
bash scripts/backup-db.sh
bash scripts/restore-db.sh <volcado.sql.gz>
FORCE=1 bash scripts/reset-db.sh

# n8n
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n

# Servicios de apoyo
# MailHog:  http://localhost:8025
# n8n:      http://localhost:5678  (admin / admin_change_me)
```

---

## 14. Cuando no está en esta guía

1. Reproduce el fallo con el **mínimo** de piezas: una llamada `curl`, no la interfaz entera.
2. Mira el log del contenedor **que corresponde**: `web` para la API, `n8n` para los workflows, `ml-service` para
   la inferencia, `postgres` para el SQL.
3. Comprueba si el fallo depende del **rol**: repite con `admin@mp.ai`. Si con admin funciona, es RBAC.
4. Si es reproducible, añádelo aquí con la causa real. Esta guía solo vale si crece con fallos que ocurrieron.
