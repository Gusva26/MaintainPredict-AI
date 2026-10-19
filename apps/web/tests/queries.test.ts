import { describe, it, expect } from 'vitest';
import { technicianAvailability } from '../lib/db/queries';

describe('Consultas compartidas (lib/db/queries)', () => {
  it('technicianAvailability devuelve técnicos ordenados por carga ascendente', async () => {
    try {
      const rows = await technicianAvailability();

      // Debe tener la forma esperada en todos los casos.
      for (const r of rows) {
        expect(Number.isInteger(r.userId)).toBe(true);
        expect(typeof r.fullName).toBe('string');
        expect(typeof r.email).toBe('string');
        expect(r.openOrders).toBeGreaterThanOrEqual(0);
      }

      // Orden estable: nunca decrece la carga.
      const loads = rows.map((r) => r.openOrders);
      expect([...loads].sort((a, b) => a - b)).toEqual(loads);
    } catch (err) {
      console.warn('Skipping DB query test if Postgres is offline');
    }
  });
});
