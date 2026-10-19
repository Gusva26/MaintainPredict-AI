import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermissionOrInternal } from '@/lib/auth/session';
import { scanDirtyData } from '@/lib/observability/dirty-data';
import { logAudit } from '@/lib/audit/log';
import { ok, handleError } from '@/lib/http/response';

const Body = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
  zThreshold: z.coerce.number().min(1).max(6).default(3),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermissionOrInternal(req, 'equipment:write'); // supervisor/admin o n8n
    const body = Body.parse(await req.json().catch(() => ({})));
    const report = await scanDirtyData(body.windowHours, body.zThreshold);

    await logAudit({
      userId: Number(session.sub), action: 'ingest_sensor', module: 'sensors',
      entityType: 'dirty_data_scan_manual',
      payload: { flagged: report.flaggedTotal, windowHours: body.windowHours },
    });

    return ok(report, {
      what: 'Resultado del escaneo de datos sucios en la ventana indicada.',
      how: 'Los registros marcados como suspect se excluyen del entrenamiento y de la predicción.',
      decision: 'Revisar sensores con muchas marcas; recalibrar o reemplazar si persisten.',
    });
  } catch (e) { return handleError(e); }
}
