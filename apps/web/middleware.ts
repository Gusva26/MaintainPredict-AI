import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, type AppJwtPayload } from '@/lib/auth/jwt';
import { can, type Permission } from '@/lib/auth/rbac';
import { ACCESS_COOKIE } from '@/lib/auth/session';

type Rule = { pattern: RegExp; method?: string; permission: Permission };

const RULES: Rule[] = [
  { pattern: /^\/api\/equipment(\/.*)?$/,                method: 'GET',    permission: 'equipment:read' },
  { pattern: /^\/api\/equipment(\/.*)?$/,                method: 'POST',   permission: 'equipment:write' },
  { pattern: /^\/api\/predictions(\/.*)?$/,              method: 'GET',    permission: 'predictions:read' },
  { pattern: /^\/api\/predict$/,                         method: 'POST',   permission: 'predict:run' },
  { pattern: /^\/api\/orders$/,                          method: 'GET',    permission: 'orders:read' },
  { pattern: /^\/api\/orders$/,                          method: 'POST',   permission: 'orders:create' },
  { pattern: /^\/api\/orders\/\d+\/complete$/,           method: 'PUT',    permission: 'orders:complete' },
  { pattern: /^\/api\/orders\/\d+\/approve$/,            method: 'POST',   permission: 'orders:approve' },
  { pattern: /^\/api\/reports\/weekly$/,                 method: 'GET',    permission: 'reports:read' },
  { pattern: /^\/api\/reports\/orders\/export$/,         method: 'GET',    permission: 'orders:read' },
  { pattern: /^\/api\/observability(\/.*)?$/,            method: 'GET',    permission: 'reports:read' },
  { pattern: /^\/api\/observability(\/.*)?$/,            method: 'POST',   permission: 'reports:read' },
  { pattern: /^\/api\/uploads$/,                         method: 'POST',   permission: 'orders:complete' },
  { pattern: /^\/api\/audit(\/.*)?$/,                    method: 'GET',    permission: 'audit:read' },
  { pattern: /^\/api\/integrations(\/.*)?$/,             method: 'GET',    permission: 'integrations:read' },
  { pattern: /^\/api\/sensors$/,                         method: 'GET',    permission: 'equipment:read' },
  { pattern: /^\/api\/sensors$/,                         method: 'POST',   permission: 'equipment:write' },
  { pattern: /^\/api\/equipment(\/.*)?$/,                method: 'PUT',    permission: 'equipment:write' },
  { pattern: /^\/api\/orders(\/.*)?$/,                   method: 'GET',    permission: 'orders:read' },
  { pattern: /^\/api\/dashboard(\/.*)?$/,                method: 'GET',    permission: 'equipment:read' },
  { pattern: /^\/api\/technicians$/,                     method: 'GET',    permission: 'orders:read' },
  { pattern: /^\/api\/users(\/.*)?$/,                    method: 'GET',    permission: 'users:manage' },
  { pattern: /^\/api\/users(\/.*)?$/,                    method: 'POST',   permission: 'users:manage' },
  { pattern: /^\/api\/users(\/.*)?$/,                    method: 'PATCH',  permission: 'users:manage' },

  // Protected pages
  { pattern: /^\/dashboard/,                             permission: 'equipment:read' },
  { pattern: /^\/equipment/,                             permission: 'equipment:read' },
  { pattern: /^\/predictions/,                           permission: 'predictions:read' },
  { pattern: /^\/orders/,                                permission: 'orders:read' },
  { pattern: /^\/observability/,                         permission: 'reports:read' },
  // Sin esta regla, un técnico entraba a /reports escribiendo la URL: la barra
  // lateral se lo ocultaba (reports:read), pero la página respondía 200.
  { pattern: /^\/reports/,                               permission: 'reports:read' },
  { pattern: /^\/integrations/,                          permission: 'integrations:read' },
  { pattern: /^\/users/,                                 permission: 'users:manage' },
  { pattern: /^\/sensors/,                               permission: 'equipment:read' },
  { pattern: /^\/audit/,                                 permission: 'audit:read' },
  { pattern: /^\/technician/,                            permission: 'orders:read' },
];

const PUBLIC = [
  /^\/login/,
  /^\/api\/auth\/(login|refresh)$/,
  /^\/api\/sensors\/data$/, // sensor auth via API key header
  /^\/api\/health$/,
  /^\/manifest\.json$/,
  /^\/sw\.js$/,
  /^\/workbox-.*\.js$/,
  /^\/icons\//,
  /^\/_next/,
  /^\/favicon/,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Chrome DevTools solicita este recurso automáticamente; si no existe, la
  // consola muestra un 404. Devolvemos 204 (sin contenido) para no ensuciarla.
  if (pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
    return new NextResponse(null, { status: 204 });
  }

  if (PUBLIC.some((p) => p.test(pathname))) {
    return NextResponse.next();
  }

  // Llamadas internas de n8n (header x-internal-token): el propio handler valida el valor
  // con requirePermissionOrInternal. Sin esto, el middleware cortaría WF-01..WF-04.
  // No se compara aquí el valor para no depender de env en tiempo de build (runtime Edge).
  if (req.headers.get('x-internal-token')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;

  if (!token) {
    return redirectOr401(req);
  }

  let session: AppJwtPayload;
  try {
    session = await verifyAccessToken(token);
  } catch {
    return redirectOr401(req);
  }

  const rule = RULES.find(
    (r) => r.pattern.test(pathname) && (!r.method || r.method === req.method)
  );

  if (rule && !can(session.role, rule.permission)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Evita bucles: los roles sin permiso de página (p. ej. technician) van a su área.
    return NextResponse.redirect(new URL('/technician?error=forbidden', req.url));
  }

  return NextResponse.next();
}

function redirectOr401(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL('/login', req.url);
  // Se conserva ruta **y** query string: los enlaces del HITL llegan como
  // /orders/:id?resume=…&decision=… y, sin el `?`, el login devolvía a la ficha sin el
  // `resume`, así que n8n se quedaba esperando y acababa avisando de un timeout falso.
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
