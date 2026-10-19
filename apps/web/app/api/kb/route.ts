import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { insertKbDoc } from '@/lib/rag/retriever';
import { created, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

const Body = z.object({
  title: z.string().min(3).max(300),
  category: z.enum(['manual', 'historico_falla', 'normativa']).optional(),
  content: z.string().min(10),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePermission('users:manage'); // admin
    const body = Body.parse(await req.json());

    const { doc_id } = await insertKbDoc(body);

    await logAudit({
      userId: Number(s.sub),
      action: 'update_equipment',
      module: 'kb',
      entityType: 'kb_doc',
      entityId: doc_id,
      payload: { title: body.title, category: body.category },
    });

    return created({ doc_id }, {
      what: 'Documento técnico indexado en la base de conocimiento (RAG).',
      how: 'Se generó su embedding vectorial de 1536 dimensiones y ya es consultable semánticamente.',
      decision: 'Los agentes Predictor y Planner considerarán este documento en sus próximas inferencias.',
    });
  } catch (e) {
    return handleError(e);
  }
}
