import { requireSession } from '@/lib/auth/session';
import { ok, handleError } from '@/lib/http/response';

export async function GET() {
  try {
    const s = await requireSession();
    return ok(
      {
        id: Number(s.sub),
        email: s.email,
        name: s.name,
        role: s.role
      },
      {
        what: 'Perfil del usuario autenticado.',
        how: 'Datos extraídos de forma segura a partir de la firma del token JWT actual.',
        decision: 'Renderizar los elementos de navegación y permisos según el rol activo.',
      }
    );
  } catch (e) {
    return handleError(e);
  }
}
