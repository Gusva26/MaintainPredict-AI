/**
 * Colores de las etiquetas que comparten varias tablas.
 *
 * Antes vivían dentro de cada componente; al añadir la tabla de órdenes derivadas
 * del detalle de predicción se habrían duplicado, así que se centralizan aquí para
 * que un estado nuevo se pinte igual en todas partes.
 */

/** Estado de una orden de mantenimiento. */
export const orderStatusVariant = (status: string) =>
  status === 'completed'
    ? 'success'
    : status === 'pending_approval'
      ? 'warning'
      : status === 'cancelled'
        ? 'destructive'
        : 'secondary';

/** Prioridad de una orden de mantenimiento. */
export const orderPriorityVariant = (priority: string) =>
  priority === 'critical' ? 'destructive' : priority === 'high' ? 'warning' : 'secondary';
