# PWA — App Técnico

Decisión **D5** del plan de cierre: se mantiene el **service worker manual** que ya
existía (`apps/web/public/sw.js` + `components/PwaRegister.tsx`) y se documenta la
desviación respecto a la especificación, que proponía `next-pwa`.

## Por qué no `next-pwa`

- `next-pwa` depende de `workbox-webpack-plugin` y su última versión estable arrastra
  una cadena de dependencias sin mantenimiento; con Next 14 en modo *dev* genera
  avisos y, en algunos casos, deja de registrar el SW.
- Lo que necesita la app es pequeño y está muy acotado: **precachear la pantalla del
  técnico**, servir assets desde caché y dejar la API en *network-first*.
- Un `sw.js` de 45 líneas es auditable y no añade dependencias al `package.json`.
  `next.config.mjs` no se toca.

**Consecuencia asumida:** no hay versionado automático de assets ni precache
generado a partir del build. Si se cambia un asset y no se cambia la constante
`CACHE`, el navegador puede seguir sirviendo la versión antigua.

## Cómo funciona

`public/sw.js`:

| Aspecto | Implementación |
|---|---|
| Caché | `const CACHE = 'mp-v1'` — una sola bolsa con nombre versionado |
| Precache | `/technician`, `/manifest.json`, `/icons/icon-192.png` en el evento `install` |
| Activación | Borra todas las cachés cuyo nombre no sea `CACHE` y hace `clients.claim()` |
| Peticiones `GET` al mismo origen | Sí; el resto pasa de largo |
| `/api/**` | *Network-first*: intenta red y, si falla, sirve la última respuesta cacheada |
| Resto (assets, HTML) | *Cache-first*: sirve de caché y, si no está, pide a red y guarda copia |

`components/PwaRegister.tsx` registra el SW en el cliente (`navigator.serviceWorker.register('/sw.js')`)
y no hace nada en servidor.

`public/manifest.json` declara nombre, `theme_color` (#2563eb), `display: standalone`
e iconos 192/512. Los iconos actuales son **placeholders generados**; hay un
comprobador en `scripts/check-pwa-icons.sh`.

`middleware.ts` deja públicas las rutas que el SW necesita aunque no haya sesión:
`/manifest.json`, `/sw.js`, `/icons/*` y `/workbox-*`.

## Cómo publicar un cambio en el SW

1. Edita `public/sw.js`.
2. **Sube la versión** de `CACHE` (por ejemplo `mp-v2`). Sin esto, los clientes que
   ya tienen el SW instalado pueden seguir con la caché vieja: el `activate` borra
   las cachés con otro nombre, que es justo el mecanismo de invalidación.
3. Recarga con `Ctrl+Shift+R` o desde DevTools → Application → Service Workers →
   *Update*.

## Limitaciones conocidas

- **No hay precache del build**: los chunks de JS de Next se cachean *on demand* la
  primera vez que se piden, no en la instalación. La primera visita offline a una
  ruta no visitada puede fallar.
- **La API no funciona offline** más allá de lo último cacheado (y las escrituras
  nunca: `POST`/`PUT`/`PATCH` no se interceptan).
- **Sin Background Sync**: una orden completada sin conexión no se reintenta sola.
- No se cachean las fotos subidas (`/uploads/*`).

Ninguna de estas limitaciones afecta al alcance del proyecto: la PWA del técnico se
usa en planta con conectividad, y el objetivo del SW es arrancar rápido y aguantar
cortes breves.

## Si algún día se quiere migrar a `next-pwa`

El código está preparado para hacerlo sin tocar componentes:

1. `pnpm add -D next-pwa` y envolver la config en `next.config.mjs` con
   `withPWA({ dest: 'public', register: false })`.
2. Borrar `public/sw.js` (lo genera `next-pwa`) y mantener `PwaRegister` apuntando a
   `/sw.js`, que seguirá existiendo.
3. Revisar `middleware.ts`: las rutas de workbox (`/workbox-*`) ya están permitidas.
4. Volver a pasar `scripts/smoke-test.sh` y comprobar en DevTools que el SW se
   registra y sirve `/technician` desde caché.
