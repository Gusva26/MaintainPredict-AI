# Política y estado de seguridad — MaintainPredict AI

Este documento tiene dos partes inseparables: **la política** (qué se exige) y **el estado real** (qué se cumple
hoy, con referencias al código). Un documento de seguridad que solo enumere buenas intenciones no sirve para
auditar nada, así que las brechas conocidas están en una tabla (§13) con su archivo y su plan de cierre.

Última revisión: **19/10/2026** (tras cerrar la fase I). Los números de línea apuntan al código de esa fecha.

---

## 1. Principios y alcance

1. **Denegar por defecto.** No existe ninguna ruta de la aplicación que sea pública por omisión: el `middleware`
   (`apps/web/middleware.ts`) lleva una **lista blanca** de rutas públicas y todo lo demás exige sesión o
   devuelve 401/307. Las páginas nuevas hay que autorizarlas explícitamente.
2. **Autorizar por permiso, no por rol.** El código pregunta por `orders:approve`, no por «¿es supervisor?».
   Un rol nuevo se define en un solo sitio (`lib/auth/rbac.ts`) y todos los puntos de control lo respetan.
3. **Las reglas de negocio viven en código.** El LLM propone, el código decide: los estados de la orden, el
   umbral de HITL y el sellado de una orden están en `lib/agents/planner.ts`, no en un prompt (§8).
4. **Trazar toda mutación.** Toda operación que cambia estado deja una entrada en la bitácora con usuario, acción,
   entidad, IP y *user-agent* (§9).
5. **Un secreto real por despliegue.** Ningún valor por defecto del repositorio vale en producción: están
   enumerados en `docs/DEPLOYMENT.md` §8 y en §6 de este documento.
6. **Fallo seguro y degradación explícita.** Si el ERP, el SCADA, el SMS o el LLM no responden, el sistema
   degrada (catálogo local, plan de respaldo, proveedor `log`) en lugar de romper el flujo — pero lo dice.

**Alcance.** Todo lo que se ejecuta en este repositorio: aplicación Next.js, servicio ML, Postgres con pgvector,
n8n, mocks y los scripts de operación.

**Fuera de alcance.** La seguridad del host, la del proveedor de nube y la del puesto de trabajo del usuario. Se
asume que el despliegue de producción usa `docker-compose.prod.yml` + Caddy tal como está documentado.

---

## 2. Activos, actores y modelo de amenazas

### 2.1 Activos a proteger

| Activo | Dónde vive | Por qué importa |
|---|---|---|
| Credenciales y sesiones | Cookies `mp_access` / `mp_refresh`, `users.password_hash` | Suplantación de rol: `orders:approve` autoriza paradas de planta |
| Plan de mantenimiento (órdenes) | `maintenance_orders` | Un estado falso puede parar producción o dejar un fallo sin atender |
| Telemetría y predicciones | `readings` (60 019 filas), `predictions` (168) | Base de las decisiones; su manipulación envenena el modelo |
| Bitácora | `audit_log` (572 filas) | Es la prueba de quién hizo qué: sin ella no hay rendición de cuentas |
| Datos personales | `users` (nombre, email, teléfono), `audit_log` (IP, *user-agent*) | RGPD (§10) |
| Secretos de integración | `.env`: JWT, `INTERNAL_TOKEN`, `SENSOR_API_KEY`, ERP/SCADA/SMS/SMTP, claves LLM | Acceso a sistemas industriales y a proveedores de IA |

### 2.2 Actores

| Actor | Cómo entra | Qué puede hacer |
|---|---|---|
| Técnico | App del técnico, sesión propia | Solo su trabajo: ver equipos/predicciones/órdenes y **completar** órdenes |
| Supervisor | Backoffice | Planificar, aprobar o **rechazar**, leer informes y ver integraciones |
| Planificador | Backoffice | Igual que supervisor salvo integraciones |
| Administrador | Backoffice | Todo, incluidos usuarios, auditoría y ajustes de modelo |
| n8n (sistema) | Red interna + `x-internal-token` | Los endpoints internos, como usuario de sistema |
| SCADA / gateways | Red interna + `x-sensor-key` | Ingesta de lecturas |
| Servicio ML | Red interna + `x-api-key` | Inferencia |
| Atacante externo | Nada expuesto salvo 80/443 (servicio `caddy`) | — |
| Insider con credenciales | Sesión válida | Es el riesgo más realista: se mitiga con mínimo privilegio y auditoría |

### 2.3 Vías de ataque consideradas

| Vía | Control principal | Estado |
|---|---|---|
| Fuerza bruta contra el login | Contraseña ≥ 10 con complejidad; **sin límite de intentos** (§13, B3) | ⚠️ Parcial |
| Robo de cookie de sesión | `HttpOnly` + `SameSite=Lax`; `Secure` **pendiente** (§13, B1) | ⚠️ Parcial |
| Escalada de privilegios por rol | RBAC por permiso + verificación en servidor y en `middleware` | ✅ |
| Suplantación de llamadas internas | `INTERNAL_TOKEN` compartido; **con valor por defecto si falta el entorno** (§13, B2) | ⚠️ Parcial |
| Inyección SQL | Drizzle ORM con consultas parametrizadas; **cero** `sql.raw` en el proyecto | ✅ |
| XSS | React escapa por defecto; **cero** `dangerouslySetInnerHTML` en el proyecto | ✅ |
| Inyección de prompt en los agentes | El LLM no decide estados; herramientas con esquema; sellado en código (§8) | ⚠️ Parcial |
| Abuso del endpoint de ingesta | `x-sensor-key` + límite de 600 req/min por clave | ✅ |
| CSRF | `SameSite=Lax` (no viaja en POST de otro origen) + ninguna mutación por GET | ✅ |
| Exfiltración por reportes | Los informes exigen `reports:read` y el `middleware` lo aplica a `/reports` y `/api/reports` | ✅ |
| SSRF por integraciones | Las URL de ERP/SCADA/SMS salen de `.env`, no de datos de usuario | ✅ |
| Fuga de secretos en logs | Las claves no se registran; los errores de integración se resumen sin cabeceras | ✅ |

---

## 3. Autenticación

**Mecanismo.** JWT firmado con **HS256** (`lib/auth/jwt.ts`), con dos tokens distintos y claves distintas:

| Token | Clave | Vida | Reclamos |
|---|---|---|---|
| `mp_access` | `JWT_SECRET` | `JWT_EXPIRES_IN` (8 h) | `sub`, `email`, `role`, `name`, `typ: 'access'` |
| `mp_refresh` | `JWT_REFRESH_SECRET` | `JWT_REFRESH_EXPIRES_IN` (7 d) | los mismos con `typ: 'refresh'` |

Se validan **emisor** (`maintainpredict`), **audiencia** (`mp-web`) y **tipo**: `verifyAccessToken` rechaza un
token con `typ !== 'access'` (`jwt.ts:48`), de modo que un refresh robado no se puede presentar como acceso.
Ambas cookies son `HttpOnly` y `SameSite=Lax`.

**Login** (`app/api/auth/login/route.ts`): busca el usuario, y falla con **401** si no existe, está inactivo o la
contraseña no cuadra — sin distinguir cuál de las tres cosas ha pasado, para no dar pistas. El intento fallido
queda auditado como `login_failed` con el email intentado, que es la señal para detectar un ataque (§12).

**Refresh** (`app/api/auth/refresh/route.ts`): reemite un acceso nuevo a partir del refresh válido.

**Logout** (`app/api/auth/logout/route.ts`): borra las dos cookies y audita.

> [!IMPORTANT]
> Dos límites estructurales de este diseño, asumidos y pendientes: **no hay revocación en servidor** (el logout
> borra la cookie, pero un token ya copiado sigue valiendo hasta su expiración), y **el refresh no consulta la
> base de datos**, así que a un usuario desactivado se le seguiría renovando el acceso con su rol antiguo hasta
> 7 días. Plan de cierre en §13 (B4).

---

## 4. Autorización (RBAC)

Matriz única en `lib/auth/rbac.ts`; la UI y el servidor la comparten (`lib/hooks/useRbac.ts` delega en ella):

| Permiso | technician | supervisor | planner | admin |
|---|:--:|:--:|:--:|:--:|
| `equipment:read` | ✅ | ✅ | ✅ | ✅ |
| `equipment:write` | — | ✅ | — | ✅ |
| `predictions:read` | ✅ | ✅ | ✅ | ✅ |
| `predict:run` | — | ✅ | — | ✅ |
| `orders:read` | ✅ | ✅ | ✅ | ✅ |
| `orders:create` | — | ✅ | ✅ | ✅ |
| `orders:approve` | — | ✅ | ✅ | ✅ |
| `orders:complete` | ✅ | — | — | ✅ |
| `sensors:ingest` | — | — | — | ✅ |
| `reports:read` | — | ✅ | ✅ | ✅ |
| `integrations:read` | — | ✅ | — | ✅ |
| `users:manage` | — | — | — | ✅ |
| `audit:read` | — | — | — | ✅ |

**Tres capas, no una:**

1. **Página** — el `middleware` contrasta la ruta con el permiso y redirige (307) si el rol no lo tiene. Rechaza
   también entrar por URL escribiendo la dirección a mano.
2. **API** — cada `route.ts` empieza por `requirePermission(perm)` / `requirePermissionOrInternal(req, perm)`. Es
   la capa que **realmente** protege los datos: la de arriba es comodidad de navegación.
3. **Interfaz** — `RoleGuard` y `useRbac` ocultan acciones que el servidor rechazaría igualmente.

**Verificación automatizada.** `scripts/check-links.sh` recorre **17 rutas × 3 roles** (51 comprobaciones) más 8
ids inválidos o inexistentes (80 en total) y
comprueba que el permiso que aplica el `middleware` coincide con el esperado: el técnico recibe 307 en
`/reports`, `/observability`, `/integrations`, `/audit` y `/users`; el supervisor, en `/audit` y `/users`. Ese
script fue el que descubrió dos incoherencias reales (un enlace con permiso distinto al de la ruta `/sensors`, y
`/reports` sin regla en el `middleware`).

---

## 5. Contraseñas y cuentas

- **Almacenamiento:** `bcryptjs` con coste **10** (`lib/auth/password.ts`). Nunca se guarda ni se devuelve el
  texto plano: `GET /api/users` no expone `passwordHash` (comprobado en la prueba de humo).
- **Política** (`lib/auth/password-policy.ts`, decisión D8): **mínimo 10 caracteres** y complejidad
  (mayúscula, minúscula, dígito y símbolo). La misma función que valida en el servidor alimenta la lista de
  requisitos que ve el usuario en `/profile`, así que la interfaz no puede prometer algo que la API rechace.
- **Cambio de contraseña** (`/api/auth/change-password`): exige la contraseña actual (401 si no cuadra) y aplica
  la política (422 si no la cumple). Ambos caminos están en la prueba de humo.
- **Ciclo de vida de la cuenta:** no se borran usuarios; se **desactivan** (`is_active`), lo que corta el login.
  El alta y el cambio de rol los hace solo `users:manage` (admin), y la API impide que un admin se desactive o se
  cambie el rol a sí mismo (evita quedarse fuera del sistema).
- **Cuentas demo** (`admin@mp.ai` y compañía, contraseña `Password123!`): existen para la demo y **deben
  eliminarse o cambiarse antes de cualquier uso real** (`docs/DEPLOYMENT.md` §8).

---

## 6. Gestión de secretos

- **Origen único:** variables de entorno. `.env` está en `.gitignore`; lo versionado es `.env.example` con
  valores de relleno, nunca claves reales.
- **Generación:** `openssl rand -base64 48` para `JWT_SECRET` y `JWT_REFRESH_SECRET`; `chmod 600 .env` en
  producción.
- **Contenedores:** las variables se inyectan por `env_file`/`environment`; no hay secretos escritos en las
  imágenes. `N8N_ENCRYPTION_KEY` cifra las credenciales almacenadas por n8n (y no debe cambiarse tras el primer
  arranque, o se pierden).
- **Rotación:** documentada en `docs/DEPLOYMENT.md` §9. Rotar `JWT_SECRET` invalida todas las sesiones activas —
  es hoy el único mecanismo de revocación masiva (§13, B4).

> [!WARNING]
> `INTERNAL_TOKEN` (`lib/http/internal-auth.ts:6`) y `SENSOR_API_KEY` (`lib/http/sensor-auth.ts:3`) tienen
> **valor por defecto en el código**. Si en un despliegue se olvidan esas dos variables, el sistema no falla:
> acepta una clave que está publicada en este repositorio, y el token interno otorga el rol de **sistema con
> rol admin** sobre los endpoints internos. Es la brecha más grave de esta lista (B2) y se cierra haciendo que el
> arranque falle si no están definidas.

---

## 7. Seguridad de la API

- **Contrato uniforme** (`lib/http/response.ts`): éxito `{ data, explanation }`, error `{ error, details }`.
  Un error nunca devuelve la traza interna: `handleError` registra la excepción y responde `500` genérico.
- **Validación de entrada:** **Zod** en todas las rutas de escritura, incluidos los `coerce` numéricos. Un cuerpo
  mal formado devuelve **422** con el detalle de campos, no un 500.
- **Códigos usados:** `200/201`, `400` (parámetro inválido, p. ej. id de orden no positivo), `401` (sin sesión o
  credenciales malas), `403` (sesión sin permiso), `404` (no existe), `409` (estado incompatible: aprobar una
  orden que no está `pending_approval`), `422` (validación), `429` (límite de ingesta) y `500`.
- **Superficie interna:** los endpoints que llama n8n aceptan `x-internal-token` **o** una sesión con permiso
  (`requirePermissionOrInternal`). El token se compara en tiempo constante de facto suficiente para este uso, pero
  su debilidad real es el valor por defecto (§6).
- **Ingesta de sensores:** `x-sensor-key` + **límite de 600 peticiones por minuto y clave**
  (`lib/http/sensor-auth.ts`), en memoria del proceso. En varias réplicas el límite es por réplica, y un reinicio
  lo resetea: es un freno, no una cuota (§13, B5).
- **Enumeración:** respuesta uniforme de credenciales inválidas y `404` para recursos inexistentes; las fichas de
  detalle comprueban la existencia en servidor (`lib/db/detail-guard.ts`) para que un id inventado no devuelva
  200 con una pantalla vacía.
- **Salida binaria:** los informes (`pdf`/`xlsx`/`docx`) se sirven con su tipo MIME y `ETag`; el nombre del
  fichero no viene de la entrada del usuario.

---

## 8. Seguridad de los agentes de IA

Los dos agentes (`lib/agents/predictor.ts`, `lib/agents/planner.ts`) usan un LLM externo. Los controles:

1. **El LLM no decide el estado del sistema.** Propone un borrador y el código lo sella:
   `sealDraftOrder` aplica las reglas (umbral de HITL de 4 h, técnico y ventana válidos, repuestos del ERP) y
   `sealPlannerOutput` fija el resultado. Si el modelo se equivoca o intenta algo fuera de regla, el código lo
   corrige o lo descarta. **Ningún camino permite que una instrucción de texto cambie un estado de la orden.**
2. **Herramientas con esquema.** El modelo solo puede invocar herramientas declaradas
   (`tool_get_technician_availability`, `tool_check_parts`, `schedule_order`…). Los argumentos se validan contra el
   JSON Schema y el proveedor rechaza los que no encajan (Groq es especialmente estricto: fue la causa de un bug
   real corregido en la fase E).
3. **Solo lectura sobre los datos sensibles.** Las herramientas del planner consultan; el único escritor de
   órdenes es `POST /api/orders/auto-plan`, que pasa por Zod, RBAC y auditoría como cualquier otra ruta.
4. **Superficie de inyección de prompt.** Entran al prompt el nombre y la criticidad del equipo, el componente,
   las lecturas y los fragmentos recuperados del RAG. Todo ello viene de la base de datos, no de un campo libre
   del usuario final, así que la vía práctica de inyección sería **envenenar la base de conocimiento** o un nombre
   de equipo manipulado. Mitigaciones actuales: el sellado en código (§8.1), que el daño posible se limita a una
   propuesta que un humano debe aprobar en HITL, y la trazabilidad de las fuentes RAG citadas en cada predicción
   (`predictions.features.rag_sources`), que permite revisar de dónde salió una afirmación.
5. **Resiliencia como control de disponibilidad** (`lib/agents/resilience.ts`): corte por intento, reintentos con
   retroceso solo para el servicio ML (el LLM no se reintenta) y planes de respaldo deterministas. Un proveedor
   caído no deja la planificación a medias ni bloquea una parada urgente.
6. **Coste y abuso:** los agentes se invocan desde rutas con permiso (`predict:run`, `orders:create`) o desde
   n8n con el token interno, no desde cualquier sesión.

> [!NOTE]
> **Datos personales hacia terceros.** El contexto del planner incluye la **disponibilidad de los técnicos con su
> nombre completo**, y ese contexto viaja al proveedor del modelo (Groq/OpenAI/OpenRouter según configuración).
> Es una transferencia de datos personales a un encargado del tratamiento y debe justificarse en el registro de
> actividades (§10 y §13, B8). La mitigación barata es enviar un identificador opaco en lugar del nombre y
> resolverlo en la interfaz.

---

## 9. Auditoría y trazabilidad

- **Qué se registra** (`lib/audit/log.ts` → tabla `audit_log`): `user_id`, `action`, `module`, `entity_type`,
  `entity_id`, `payload`, `ip_address`, `user_agent` y `created_at` (UTC).
- **Acciones del catálogo:** `login`, `logout`, `login_failed`, `change_password`, `create_order`,
  `approve_order`, `reject_order`, `complete_order`, `create_prediction`, `update_equipment`, `create_sensor`,
  `update_sensor`, `create_user`, `update_user`, `read_report`, `ingest_sensor`.
- **Garantía en tiempo de compilación:** `lib/audit/catalog.ts` debe cubrir todas las acciones que acepta
  `log.ts`; si se añade una acción y no se etiqueta, **falla la compilación**. Así la interfaz de auditoría no
  puede quedarse ciega a una acción nueva.
- **La auditoría no bloquea la operación:** si fallar al escribir la bitácora tumbara la petición, se acabaría
  prefiriendo desactivarla. `logAudit` captura el error y lo registra en consola.
- **Lectura:** solo `audit:read` (admin) sobre `GET /api/audit` y la página `/audit`, con filtros por módulo,
  acción y rango de fechas.
- **IP de origen:** se toma la primera de `x-forwarded-for`. Detrás de Caddy es fiable; si se expone la
  aplicación sin proxy que reescriba la cabecera, **el cliente puede falsificarla** (B10).
- **Verificación real:** la prueba `scripts/e2e-hitl.mjs` comprueba que al rechazar una orden queda
  `reject_order` y **no** `approve_order`, que es justo la forma de detectar una aprobación fantasma.

---

## 10. Protección de datos y RGPD

**Datos personales tratados** (inventario mínimo necesario):

| Dato | Tabla | Finalidad | Base jurídica |
|---|---|---|---|
| Nombre y email | `users` | Identificación y autenticación | Interés legítimo / relación contractual |
| Teléfono | `users` | Aviso al técnico asignado (SMS) | Interés legítimo |
| `last_login_at` | `users` | Seguridad de la cuenta | Interés legítimo |
| IP y *user-agent* | `audit_log` | Seguridad y rendición de cuentas | Interés legítimo / obligación de trazabilidad |

**Decisiones de minimización ya aplicadas:** el teléfono del técnico solo se usa para notificar la orden que
tiene asignada; la auditoría no guarda el cuerpo de las peticiones (únicamente el `payload` que cada acción
decide registrar, y ninguna acción guarda contraseñas ni tokens); los informes no incluyen credenciales.

**Derechos de las personas y estado actual:**

| Derecho | Cómo se atendería hoy | Automatizado |
|---|---|---|
| Acceso | `SELECT` sobre `users` + `audit_log` filtrando por el interesado | Manual |
| Rectificación | `PATCH /api/users/:id` (admin) | Sí |
| Supresión | **No existe borrado:** los usuarios se desactivan (`is_active=false`) | ❌ B11 |
| Portabilidad | Exportación de informe, no específica por persona | Manual |
| Oposición al tratamiento por IA | El HITL obliga a que un humano decida; la predicción nunca ejecuta sola | Sí, por diseño |

**Conservación.** No hay política de retención automática: `readings` crece con la telemetría y `audit_log` con
cada mutación (§13, B12). Recomendación: conservar telemetría agregada y fijar retención para la bitácora
(p. ej. 12 meses) y para los datos de contacto de usuarios desactivados.

**Transferencias internacionales.** Los prompts viajan a proveedores de LLM y los embeddings a Google (Gemini)
o OpenAI, fuera del control del despliegue. Requiere contrato de encargado y, si aplica, evaluación de la
transferencia. Ver el aviso de §8 (nombres de técnicos en el contexto).

**Seguridad del tratamiento:** contraseñas con hash bcrypt, control de acceso por permiso, bitácora con autor, y
copias de seguridad (cifrado **pendiente**, §13 B7).

---

## 11. Infraestructura, red y despliegue

**Desarrollo.** Un único `docker-compose.yml` con todo en local: Postgres, web, ml-service, n8n, los tres mocks,
MailHog. No hay TLS y los mocks no autentican: **es un entorno de laboratorio, no un entorno para datos reales**.

**Producción** (`docker-compose.prod.yml`): `caddy`, `web`, `postgres`, `ml-service`, `n8n`, `pg-backup` y
`reports-init`. Controles reales:

| Control | Cómo se aplica |
|---|---|
| Exposición de red | **Solo Caddy publica puertos** (80/443). Postgres, web, ml-service y n8n **no** publican puertos: se alcanzan únicamente por la red interna de Compose |
| TLS | Caddy emite y renueva certificados (Let's Encrypt); la API administrativa de Caddy va con `admin off` |
| Cabeceras | Caddy añade `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy`, y **oculta** la cabecera `Server`. **No hay CSP** (§13, B6) |
| Healthchecks | El `reverse_proxy` de Caddy vigila `/api/health` cada 30 s y retira instancias que no responden |
| Base de datos | Usuario de aplicación sin superusuario; `postgres` aislado de la red pública |
| Copias | Servicio `pg-backup` con volcados diarios/semanales/mensuales — **sin cifrar** (§13, B7) |
| Correo | En desarrollo, MailHog (todo el correo es visible: no usar datos reales); en producción, SMTP real |

**Aislamiento entre servicios.** El límite de confianza es la red de Compose más los secretos compartidos
(`INTERNAL_TOKEN`, `SENSOR_API_KEY`, `ML_SERVICE_API_KEY`). No hay mTLS ni identidades por servicio: quien esté
dentro de la red y conozca el token es «el sistema». Es aceptable en un despliegue de una sola máquina y deja de
serlo si se reparte en varias (§13, B9).

---

## 12. Gestión de incidentes

**Señales de detección que ya genera el sistema** (todas consultables desde `/audit`):

| Señal | Dónde se ve |
|---|---|
| Intentos de login fallidos repetidos | entradas `login_failed` con el email intentado |
| Mutaciones fuera de horario o por usuario inesperado | `audit_log` con `user_id` + `created_at` (UTC) + IP |
| Aprobaciones o rechazos sin HITL asociado | `approve_order`/`reject_order` sobre órdenes que no pasaron por HITL |
| Ingesta anómala | respuestas `429` de `scripts/smoke-test.sh` o de los logs del contenedor `web` |
| Uso de claves por defecto | checklist de despliegue (`docs/DEPLOYMENT.md` §8) |
| Integraciones caídas o degradadas | `GET /api/integrations/health` y el informe semanal |

**Procedimiento:**

1. **Contener.** Si el incidente es de credenciales: rotar `JWT_SECRET` (invalida todas las sesiones, §6), rotar
   `INTERNAL_TOKEN`/`SENSOR_API_KEY` y recrear los contenedores afectados. Si es de un proveedor externo, cortar
   la integración por configuración (`INTEGRATIONS_MODE`, `SMS_PROVIDER`, `OPENAI_BASE_URL`).
2. **Evaluar.** Acotar por bitácora: usuario, rango de fechas, entidad (`entity_type` + `entity_id`) e IP.
   Contrastar con `git log` del despliegue y con las ejecuciones de n8n.
3. **Erradicar.** Corregir la causa (revisar los permisos del rol implicado, cerrar la ruta expuesta) y revalidar
   con `scripts/check-links.sh` + `scripts/smoke-test.sh` antes de devolver el servicio.
4. **Recuperar.** Restaurar desde copia si hay datos alterados
   (`./scripts/restore-db.sh <volcado.sql.gz>`), o reconstruir con `FORCE=1 ./scripts/reset-db.sh` si el entorno
   es de demo.
5. **Aprender.** Añadir la comprobación que habría detectado el incidente antes: en este proyecto, todo hallazgo
   acaba en `docs/PLAN_CIERRE_BRECHAS.md` o en un script de verificación, no en un comentario.

**Plazos de notificación (RGPD).** Una brecha de datos personales debe notificarse a la autoridad de control en
**72 horas** desde que se tiene constancia, y a las personas afectadas si el riesgo es alto. Este documento deja
constancia de que los datos con esa consideración son los de la tabla de §10.

---

## 13. Brechas conocidas y su plan de cierre

Todo lo que sigue está **sin resolver** y es honesto decirlo. Ninguna se descubre leyendo este documento por
primera vez: están referenciadas al código.

| # | Brecha | Impacto | Dónde | Cierre previsto |
|---|---|---|---|---|
| **B1** | Las cookies de sesión se emiten con `secure: false` fijo en el login; el refresh directamente **omite** `secure` | Sobre HTTP, la cookie viaja en claro | `app/api/auth/login/route.ts:61` y `:69`; `app/api/auth/refresh/route.ts:28-33` | `secure: process.env.NODE_ENV === 'production'` en ambos |
| **B2** | `INTERNAL_TOKEN` y `SENSOR_API_KEY` tienen valor por defecto en el código | Suplantación del sistema (rol admin en endpoints internos) si se olvida la variable | `lib/http/internal-auth.ts:6`, `lib/http/sensor-auth.ts:3` | Fallar el arranque si no están definidos en producción |
| **B3** | Sin límite de intentos ni bloqueo en el login | Fuerza bruta contra contraseñas | `app/api/auth/login/route.ts` | Reutilizar el contador de `sensor-auth` por email + IP y bloqueo progresivo |
| **B4** | Sin revocación de sesión ni rotación de refresh; el refresh no revalida contra la BD | Un token robado sigue valiendo; un usuario desactivado conserva su rol hasta 7 días | `app/api/auth/{logout,refresh}/route.ts` | Lista de revocación por `jti` + comprobar `is_active`/`role` al renovar |
| **B5** | El límite de ingesta es en memoria | Con varias réplicas el límite se multiplica | `lib/http/sensor-auth.ts` | Moverlo a Caddy o a Redis |
| **B6** | Sin `Content-Security-Policy` | XSS tendría menos frenos (React y la ausencia de HTML crudo son la defensa actual) | `infra/caddy/Caddyfile` | Añadir CSP con `default-src 'self'` y probar la UI completa |
| **B7** | Las copias de seguridad no se cifran | Fuga de la base completa si se filtra el volumen | `docker-compose.prod.yml` (servicio `pg-backup`) | **Fase J.1**: cifrado con `age`/gpg y restauración probada |
| **B8** | Los nombres de los técnicos viajan al proveedor del LLM | Transferencia de datos personales a un tercero | `lib/agents/planner.ts` (contexto del prompt) | Enviar identificadores opacos; documentarlo en el registro de tratamiento |
| **B9** | Confianza implícita en la red interna (sin mTLS) | Movimiento lateral si se compromete un contenedor | `docker-compose.prod.yml` | mTLS de Caddy o tokens por servicio |
| **B10** | La IP de auditoría confía en `x-forwarded-for` | Se puede falsificar si no hay proxy delante | `lib/audit/log.ts:57` | Documentar que el despliegue soportado va detrás de Caddy; validar la cabecera |
| **B11** | No hay borrado ni anonimización de usuarios | Atender el derecho de supresión exige tocar la base a mano | `users` (solo `is_active`) | Endpoint de anonimización que conserve la integridad referencial de la auditoría |
| **B12** | Sin retención automática | `readings` y `audit_log` crecen sin límite | esquema de datos | Política de retención + job periódico |

**Cerradas** (se dejan aquí para que no se reintroduzcan):

| # | Qué era | Cómo se cerró |
|---|---|---|
| C1 | Redirección abierta: el `next` del login llegaba por la URL sin comprobar | 19/10/2026: `LoginForm` solo acepta rutas internas (`/^\/(?!\/)/` y sin `\`) |
| C2 | El enlace HITL del correo perdía `resume` y `decision` al pasar por el login | 19/10/2026: el `middleware` conserva ruta **y** query string |
| C3 | `/reports` no tenía regla en el `middleware`: un técnico veía el informe de negocio por URL | 19/10/2026 (fase G): regla `reports:read` |
| C4 | El correo HITL permitía aprobar pero no rechazar, sin alternativa documentada | 19/10/2026 (fase I): las dos decisiones con auditoría diferenciada |

---

## 14. Checklist de revisión de seguridad

Para una revisión rápida de un despliegue, en orden de rentabilidad:

- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` aleatorios (≥ 32) y **distintos** entre sí
- [ ] `INTERNAL_TOKEN` y `SENSOR_API_KEY` **no** valen los valores de `.env.example`
- [ ] `POSTGRES_PASSWORD` fuerte y `POSTGRES_USER` sin privilegios de superusuario
- [ ] `.env` con permisos `600` y fuera del control de versiones
- [ ] Cuentas demo eliminadas o con contraseña cambiada
- [ ] Caddy emite certificados y se ven las cabeceras de seguridad:
      `curl -sI https://<dominio> | grep -i strict-transport`
- [ ] Solo Caddy publica puertos: `ss -ltnp | grep -E ':(80|443)'`
- [ ] `scripts/smoke-test.sh` en verde contra el dominio real
- [ ] `scripts/check-links.sh` en verde (matriz de rutas × rol)
- [ ] Bitácora con actividad reciente y sin `login_failed` masivos:
      `SELECT count(*) FROM audit_log WHERE action='login_failed' AND created_at > now() - interval '1 day';`
- [ ] `GET /api/integrations/health` con los adaptadores que correspondan al modo configurado
- [ ] Copia de seguridad restaurada al menos una vez en un entorno limpio (y, tras J.1, cifrada)
- [ ] Revisadas las brechas B1–B12 de §13 y decidido, para cada una, si aplica al despliegue
