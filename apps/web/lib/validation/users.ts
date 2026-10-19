import { z } from 'zod';
import { PasswordSchema } from '@/lib/auth/password-policy';

/**
 * Esquemas y constantes de usuarios.
 *
 * Viven aquí (y no en `app/api/users/route.ts`) por dos motivos:
 *   1. Next 14 solo permite exportar handlers desde un `route.ts`; cualquier otro
 *      export hace fallar la generación de tipos (`.next/types`).
 *   2. Los comparten `POST /api/users` y `PATCH /api/users/:id`.
 */

export const ROLES = ['technician', 'supervisor', 'planner', 'admin'] as const;
export type RoleName = (typeof ROLES)[number];

/**
 * `is_active=false` en la query llegaría como la cadena "false", que es *truthy*;
 * `z.coerce.boolean()` lo convertiría a `true`. Por eso se compara explícitamente.
 */
const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const UserFilters = z.object({
  q: z.string().optional(),
  role: z.enum(ROLES).optional(),
  is_active: booleanQuery,
});

export const UserCreateBody = z.object({
  email: z.string().email().max(180),
  full_name: z.string().min(2).max(200),
  role: z.enum(ROLES),
  password: PasswordSchema,
  phone: z.string().max(30).optional(),
});

export const UserUpdateBody = z.object({
  full_name: z.string().min(2).max(200).optional(),
  role: z.enum(ROLES).optional(),
  phone: z.string().max(30).nullable().optional(),
  is_active: z.boolean().optional(),
  password: PasswordSchema.optional(),
});
