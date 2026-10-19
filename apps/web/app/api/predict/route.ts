import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { equipment, sensors, readings, predictions } from '@/lib/db/schema';
import { requirePermissionOrInternal } from '@/lib/http/internal-auth';
import { logAudit } from '@/lib/audit/log';
import { created, fail, handleError } from '@/lib/http/response';
import { runPredictorAgent } from '@/lib/agents/predictor';

const Body = z.object({
  equipment_id: z.coerce.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePermissionOrInternal(req, 'predict:run');
    const { equipment_id } = Body.parse(await req.json());

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, equipment_id)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    const sensorRows = await db.select().from(sensors).where(eq(sensors.equipmentId, equipment_id));
    const signals: { type: string; value: number; min: number; max: number; unit?: string }[] = [];

    for (const sr of sensorRows) {
      const [r] = await db.select().from(readings)
        .where(eq(readings.sensorId, sr.sensorId))
        .orderBy(desc(readings.recordedAt)).limit(1);
      if (!r || r.quality !== 'good') continue;

      signals.push({
        type: sr.type,
        value: Number(r.value),
        min: sr.minThreshold != null ? Number(sr.minThreshold) : 0,
        max: sr.maxThreshold != null ? Number(sr.maxThreshold) : 100,
        unit: sr.unit ?? undefined,
      });
    }

    const recent = await db.select().from(predictions)
      .where(eq(predictions.equipmentId, equipment_id))
      .orderBy(desc(predictions.createdAt)).limit(5);

    const result = await runPredictorAgent({
      equipmentId: equipment_id,
      equipmentName: eq_.name,
      equipmentType: eq_.type,
      criticality: eq_.criticality || 'medium',
      signals,
      recentHistory: recent.map((r) => ({
        component: r.component ?? 'unknown',
        probability: Number(r.failureProbability),
        createdAt: r.createdAt?.toISOString() ?? '',
      })),
    });

    const [row] = await db.insert(predictions).values({
      equipmentId: equipment_id,
      component: result.component,
      failureProbability: String(result.failure_probability),
      windowDays: 7,
      modelVersion: result.model_version,
      explanation: result.explanation,
      features: {
        inputs: signals,
        top_features: result.top_features,
        rag_sources: result.rag_sources,
      },
    }).returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'create_prediction',
      module: 'predictions',
      entityType: 'prediction',
      entityId: row.predictionId,
      payload: { equipmentId: equipment_id, probability: result.failure_probability },
    });

    const alert = result.failure_probability > 0.7;

    return created({
      prediction_id: row.predictionId,
      equipment_id: equipment_id,
      failure_probability: result.failure_probability,
      window: result.window,
      component: result.component,
      model_version: result.model_version,
      explanation: result.explanation,
      top_features: result.top_features,
      rag_sources: result.rag_sources,
      alert,
    }, {
      what: `Predicción generada por PredictorAgent (modelo ${result.model_version}).`,
      how: result.explanation,
      decision: alert
        ? 'Probabilidad > 0.70 → disparar PlannerAgent (WF-02) para crear orden automática.'
        : 'Sin acción inmediata; seguir monitorizando.',
    });
  } catch (e) {
    return handleError(e);
  }
}
