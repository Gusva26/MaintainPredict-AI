import { z } from 'zod';

/**
 * Esquemas de validación de sensores.
 *
 * Viven fuera de los `route.ts` porque los comparten dos endpoints:
 *   - `POST /api/sensors`               (alta indicando `equipment_id`)
 *   - `POST /api/equipment/:id/sensors` (alta anidada bajo el equipo)
 */

export const SENSOR_STATUS = ['active', 'inactive', 'maintenance'] as const;

export const SensorFields = z.object({
  type: z.string().min(2).max(50),
  unit: z.string().max(20).optional(),
  status: z.enum(SENSOR_STATUS).default('active'),
  min_threshold: z.coerce.number().optional(),
  max_threshold: z.coerce.number().optional(),
});

export const SensorCreateBody = SensorFields.extend({
  equipment_id: z.coerce.number().int().positive(),
});

export const SensorFilters = z.object({
  q: z.string().optional(),
  equipment_id: z.coerce.number().int().positive().optional(),
  type: z.string().optional(),
  status: z.enum(SENSOR_STATUS).optional(),
});

export type SensorInput = z.infer<typeof SensorFields>;

/** Devuelve el mensaje de error si los umbrales son incoherentes, o `null` si están bien. */
export function thresholdsError(min?: number, max?: number): string | null {
  if (min != null && max != null && min >= max) return 'min_threshold debe ser menor que max_threshold';
  return null;
}

/** Normaliza a los tipos que espera Drizzle (numeric como string). */
export function sensorRow(input: SensorInput) {
  return {
    type: input.type,
    unit: input.unit,
    status: input.status,
    minThreshold: input.min_threshold != null ? String(input.min_threshold) : undefined,
    maxThreshold: input.max_threshold != null ? String(input.max_threshold) : undefined,
  };
}
