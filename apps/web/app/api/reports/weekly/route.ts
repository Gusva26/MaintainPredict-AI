/**
 * GET /api/reports/weekly — informe semanal operacional y de gestión.
 *
 * Query: `start?`, `end?`, `equipmentId?`, `technicianId?`, `format=json|pdf|xlsx|docx`.
 *
 * **Streaming (D7 / H.4).** Solo el **PDF** se sirve en *streaming* (PDFKit emite poco a poco
 * y aquí se convierte el stream de Node a `ReadableStream` sin materializarlo entero). XLSX y
 * DOCX se **generan completos en memoria** antes de responder, porque sus librerías
 * (`exceljs`, `docx`) cierran el fichero (ZIP) al terminar y no exponen un flujo incremental.
 * Con el volumen actual (≤ 200 órdenes y ≤ 100 predicciones de detalle) son unos cientos de
 * KB, así que la diferencia es de latencia, no de memoria. Si el informe creciera mucho, la
 * salida sería montarlo en WF-03 y dejar que n8n entregue el fichero ya generado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requirePermissionOrInternal } from '@/lib/auth/session';
import { fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';
import { aggregateWeeklyReport } from '@/lib/reports/aggregate';
import { buildWeeklyPdf } from '@/lib/reports/pdf';
import { buildWeeklyXlsx } from '@/lib/reports/xlsx';
import { buildWeeklyDocx } from '@/lib/reports/docx';

/**
 * Ventana por defecto: últimos 7 días.
 *
 * El extremo se **ancla a la hora en curso** a propósito. Si se usara `new Date()` tal cual,
 * cada petición tendría un rango distinto → clave de caché distinta → nunca habría acierto y
 * el `ETag` cambiaría en cada llamada. Con el ancla, dentro de la misma hora el rango es el
 * mismo, la caché (H.1) sirve el informe ya construido y el `ETag` se mantiene estable.
 * El informe sigue cubriendo los últimos 7 días (con hasta una hora de desfase).
 */
function defaultWindow() {
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  const start = new Date(end.getTime() - 7 * 86400 * 1000);
  return { start, end };
}

const EXPLANATION = {
  what: 'Reporte semanal operacional y de gestión.',
  how: 'Agrega órdenes por estado, top equipos en riesgo, métricas del modelo y KPIs de negocio. Admite filtros por equipo (equipmentId) y técnico (technicianId).',
  decision: 'Comparar con los objetivos (paradas −60%, costos −30%, precisión 85%) y priorizar acciones.',
};

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermissionOrInternal(req, 'reports:read');
    const url = new URL(req.url);

    const def = defaultWindow();
    const start = url.searchParams.get('start') ? new Date(url.searchParams.get('start')!) : def.start;
    const end = url.searchParams.get('end') ? new Date(url.searchParams.get('end')!) : def.end;
    const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

    // Filtros opcionales (H.1). Un valor no numérico se ignora en lugar de romper el informe.
    const eqParam = url.searchParams.get('equipmentId');
    const tecParam = url.searchParams.get('technicianId');
    const filters = {
      equipmentId: eqParam && Number.isFinite(Number(eqParam)) ? Number(eqParam) : undefined,
      technicianId: tecParam && Number.isFinite(Number(tecParam)) ? Number(tecParam) : undefined,
    };

    const data = await aggregateWeeklyReport(start, end, filters);

    // ETag del contenido: `generatedAt` se excluye del hash a propósito, para que un cliente que
    // sondea (o WF-03) reciba 304 mientras los datos no cambien, aunque el agregado se reconstruya
    // al expirar su caché de 60 s.
    const { generatedAt: _generatedAt, ...etagPayload } = data;
    const etag = `W/"${createHash('sha1').update(JSON.stringify(etagPayload)).digest('hex').slice(0, 16)}"`;
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    await logAudit({
      userId: session.sub === '0' ? null : Number(session.sub),
      action: 'read_report', module: 'reports',
      payload: { window: data.window, format, filters: data.filters },
    });

    const suffix = [
      data.filters.equipmentId ? `eq${data.filters.equipmentId}` : null,
      data.filters.technicianId ? `tec${data.filters.technicianId}` : null,
    ].filter(Boolean).join('-');
    const filenameBase = `maintainpredict-weekly-${data.window.start.slice(0, 10)}_${data.window.end.slice(0, 10)}${suffix ? `-${suffix}` : ''}`;

    if (format === 'pdf') {
      const stream = buildWeeklyPdf(data);
      return streamResponse(stream, 'application/pdf', `${filenameBase}.pdf`, etag);
    }

    if (format === 'xlsx') {
      const buf = await buildWeeklyXlsx(data);
      return bufferResponse(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${filenameBase}.xlsx`, etag);
    }

    if (format === 'docx') {
      const buf = await buildWeeklyDocx(data);
      return bufferResponse(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${filenameBase}.docx`, etag);
    }

    if (format === 'json') {
      return NextResponse.json({ data, explanation: EXPLANATION }, { headers: { ETag: etag } });
    }

    return fail(400, `Formato no soportado: ${format}. Usa json|pdf|xlsx|docx`);
  } catch (e) { return handleError(e); }
}

/** Convierte un ReadableStream/Node stream de PDFKit en Response streaming. */
function streamResponse(nodeStream: NodeJS.ReadableStream, contentType: string, filename: string, etag: string) {
  const webStream = nodeToWeb(nodeStream);
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, max-age=300',
      ETag: etag,
    },
  });
}

function bufferResponse(buf: Buffer, contentType: string, filename: string, etag: string) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, max-age=300',
      ETag: etag,
      'content-length': String(buf.length),
    },
  });
}

function nodeToWeb(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as any).destroy?.();
    },
  });
}
