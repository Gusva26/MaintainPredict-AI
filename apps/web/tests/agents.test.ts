import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../lib/db/client';
import { equipment, sensors, readings } from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { runPredictorAgent } from '../lib/agents/predictor';
import { runPlannerAgent } from '../lib/agents/planner';

/**
 * Tests de agentes en modo offline:
 * - Sin OPENAI_API_KEY → PredictorAgent devuelve explicación fallback y ML service (o fallback heurístico).
 * - PlannerAgent usa fallbackPlan determinista con tools.
 */
let eqId = 1;

beforeAll(async () => {
  try {
    const [e] = await db.select().from(equipment).limit(1);
    if (e) {
      eqId = e.equipmentId;
    }

    let s = await db.select().from(sensors).where(eq(sensors.equipmentId, eqId));
    if (s.length === 0) {
      await db.insert(sensors).values([
        { equipmentId: eqId, type: 'vibration', unit: 'mm/s', minThreshold: '0', maxThreshold: '11' },
        { equipmentId: eqId, type: 'temperature', unit: '°C', minThreshold: '0', maxThreshold: '95' },
      ]);
      s = await db.select().from(sensors).where(eq(sensors.equipmentId, eqId));
    }

    for (const sr of s) {
      const [r] = await db.select().from(readings)
        .where(eq(readings.sensorId, sr.sensorId))
        .orderBy(desc(readings.recordedAt)).limit(1);
      if (!r) {
        await db.insert(readings).values({ sensorId: sr.sensorId, value: '8.2', quality: 'good' });
      }
    }
  } catch (err) {
    console.warn('[beforeAll] DB not available in offline test mode');
  }
});

describe('PredictorAgent', () => {
  it('devuelve el shape del 18.2 y probabilidad en [0, 1]', async () => {
    const signals = [
      { type: 'vibration', value: 8.5, min: 0, max: 11, unit: 'mm/s' },
      { type: 'temperature', value: 78.0, min: 0, max: 95, unit: '°C' }
    ];

    const out = await runPredictorAgent({
      equipmentId: eqId,
      equipmentName: 'EQ-00001-Pump',
      equipmentType: 'Pump',
      criticality: 'critical',
      signals,
    });

    expect(out.equipment_id).toBe(eqId);
    expect(out.failure_probability).toBeGreaterThanOrEqual(0);
    expect(out.failure_probability).toBeLessThanOrEqual(1);
    expect(out.window).toBeDefined();
    expect(out.component).toBeTruthy();
    expect(out.explanation.length).toBeGreaterThan(5);
  });
});

describe('PlannerAgent', () => {
  it('respeta la regla HITL cuando parada estimada > 4h', async () => {
    const plan = await runPlannerAgent({
      predictionId: 1,
      equipmentId: eqId,
      component: 'bearing',
      failureProbability: 0.92,
      window: '7d',
      criticality: 'critical',
      downtimeCostEurH: 1200,
    });

    expect(plan.requires_hitl).toBe(plan.estimated_downtime_h > 4);
    expect(plan.parts.length).toBeGreaterThan(0);
    expect(plan.technician_id === null || typeof plan.technician_id === 'number').toBe(true);
    expect(plan.priority).toBeDefined();
    expect(plan.reasoning.length).toBeGreaterThan(5);
  });
});
