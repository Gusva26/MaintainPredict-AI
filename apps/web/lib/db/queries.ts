import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

/**
 * Columnas públicas de `users`: todo menos `password_hash`.
 * Para que ningún endpoint pueda filtrar el hash por descuido.
 */
export const userPublicColumns = {
  userId: users.userId,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  phone: users.phone,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/** Carga de trabajo de cada técnico: órdenes abiertas (planned/approved/in_progress). */
export type TechnicianAvailability = {
  userId: number;
  fullName: string;
  email: string;
  openOrders: number;
};

/**
 * Lista de técnicos ordenada por menor carga de trabajo.
 *
 * La comparten `GET /api/technicians` y la herramienta del PlannerAgent, para que
 * la UI y el agente nunca discrepen sobre quién está más libre.
 */
export async function technicianAvailability(): Promise<TechnicianAvailability[]> {
  const rows = await db
    .select({
      userId: users.userId,
      fullName: users.fullName,
      email: users.email,
      openOrders: sql<number>`(
        SELECT count(*)::int FROM maintenance_orders mo
        WHERE mo.technician_id = ${users.userId}
          AND mo.status IN ('planned', 'approved', 'in_progress')
      )`,
    })
    .from(users)
    .where(eq(users.role, 'technician'));

  return rows
    .map((r) => ({ ...r, openOrders: Number(r.openOrders) }))
    .sort((a, b) => a.openOrders - b.openOrders || a.fullName.localeCompare(b.fullName));
}
