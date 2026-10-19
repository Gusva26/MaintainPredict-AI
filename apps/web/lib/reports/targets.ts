import { z } from 'zod';

/**
 * Objetivos de negocio del proyecto (especificación §12 / reglas 23.x).
 *
 * Los usa `GET /api/dashboard/kpis` para que la UI compare el valor actual con la
 * meta sin duplicar los números. Viven aquí porque un `route.ts` de Next solo
 * puede exportar handlers.
 */
export const KPI_TARGETS = {
  /** Precisión mínima del modelo. */
  precision: 0.85,
  /** Reducción objetivo de horas de parada. */
  downtime_reduction: 0.60,
  /** Reducción objetivo de costes de mantenimiento. */
  cost_reduction: 0.30,
  /** Disponibilidad objetivo de los activos. */
  availability: 0.995,
} as const;
