import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { equipment, maintenanceOrders, predictions } from './schema';

/**
 * Guardas de existencia para las fichas dinámicas.
 *
 * El problema (G.1/G.7): `/equipment/[id]` renderiza un componente de cliente que
 * pide los datos con SWR. Si el id existe pero el recurso no, la página respondía
 * **200 con un aviso** («no se ha podido cargar»), lo que engaña a cualquier
 * monitor que cuente 404, y una URL mal copiada parecía válida.
 *
 * Solución: comprobar la existencia en el servidor, antes de renderizar. Es una
 * lectura por clave primaria (índice único, ~1 ms) y a cambio la respuesta HTTP dice
 * la verdad. El cliente sigue pidiendo los datos con SWR; esto solo decide el 200/404.
 *
 * Ojo con el orden: primero se valida que el id sea numérico (sin tocar la base de
 * datos) y después se consulta. Nunca al revés.
 */

function ensure(found: unknown): void {
  if (!found) notFound();
}

/** Devuelve el id si es un entero positivo; si no, responde 404 sin consultar la base. */
export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return id;
}

export async function equipmentExists(id: number): Promise<void> {
  const [row] = await db
    .select({ id: equipment.equipmentId })
    .from(equipment)
    .where(eq(equipment.equipmentId, id))
    .limit(1);
  ensure(row);
}

export async function orderExists(id: number): Promise<void> {
  const [row] = await db
    .select({ id: maintenanceOrders.orderId })
    .from(maintenanceOrders)
    .where(eq(maintenanceOrders.orderId, id))
    .limit(1);
  ensure(row);
}

export async function predictionExists(id: number): Promise<void> {
  const [row] = await db
    .select({ id: predictions.predictionId })
    .from(predictions)
    .where(eq(predictions.predictionId, id))
    .limit(1);
  ensure(row);
}
