import PDFDocument from 'pdfkit';
import type { WeeklyReportData } from './aggregate';

const BLUE = '#2563eb';
const DARK = '#0f172a';
const MUTED = '#64748b';
const RED = '#dc2626';
const GREEN = '#16a34a';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtEur(n: number) { return `€${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`; }

/** Crea el PDF y devuelve el stream listo para pipe a la respuesta HTTP. */
export function buildWeeklyPdf(data: WeeklyReportData): NodeJS.ReadableStream {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'MaintainPredict AI — Reporte semanal' } });

  // ── Cabecera ──────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 70).fill(BLUE);
  doc.fillColor('#ffffff').fontSize(20).text('MaintainPredict AI', 40, 22);
  doc.fontSize(10).text('Reporte semanal operacional y de gestión', 40, 46);
  doc.fillColor(DARK);
  doc.y = 90;

  doc.fontSize(9).fillColor(MUTED)
    .text(`Periodo: ${fmtDate(data.window.start)} → ${fmtDate(data.window.end)}`, { continued: true })
    .text(`    Generado: ${fmtDate(data.generatedAt)}`, { align: 'right' });
  doc.fillColor(DARK).moveDown(1);

  // ── KPIs de negocio ───────────────────────────────────────────────
  section(doc, 'KPIs de negocio');
  const kpi = Object.fromEntries(data.businessKpis.map((k) => [k.name, k.value]));
  const metric = Object.fromEntries(data.modelMetrics.map((m) => [m.metric, m.value]));
  kpiRow(doc, [
    { label: 'Paradas evitadas', value: `${(kpi.downtime_avoided_h ?? 0).toFixed(0)} h`, target: 'objetivo −60%' },
    { label: 'Ahorro estimado', value: fmtEur(kpi.cost_savings_eur ?? 0), target: 'objetivo −30%' },
    { label: 'Precisión modelo', value: `${((metric.precision ?? 0) * 100).toFixed(1)}%`, target: 'objetivo 85%' },
    { label: 'Disponibilidad', value: `${((kpi.availability ?? 0) * 100).toFixed(1)}%`, target: 'planta global' },
  ]);

  // ── Órdenes por estado ────────────────────────────────────────────
  section(doc, 'Órdenes por estado');
  table(doc,
    ['Estado', 'Nº'],
    data.ordersByStatus.map((o) => [o.status, String(o.n)]),
    [320, 120],
  );

  // ── Top equipos en riesgo ─────────────────────────────────────────
  section(doc, 'Top equipos en riesgo');
  table(doc,
    ['Equipo', 'Criticidad', 'Prob. media', 'Prob. máx', 'Nº pred.'],
    data.topPredictions.map((p) => [
      p.name ?? `#${p.equipmentId}`,
      p.criticality ?? '—',
      `${(p.avgProb * 100).toFixed(1)}%`,
      `${(p.maxProb * 100).toFixed(1)}%`,
      String(p.n),
    ]),
    [200, 80, 80, 80, 60],
  );

  // ── Órdenes detalle (primeras 30) ─────────────────────────────────
  section(doc, 'Detalle de órdenes (últimas 30)');
  table(doc,
    ['ID', 'Equipo', 'Estado', 'Prioridad', 'Programada', 'Técnico', 'Parada (h)', 'HITL'],
    data.ordersDetail.slice(0, 30).map((o) => [
      `#${o.orderId}`,
      o.equipmentName ?? '—',
      o.status,
      o.priority,
      fmtDate(o.scheduledDate),
      o.technicianName ?? '—',
      o.estimatedDowntimeH != null ? o.estimatedDowntimeH.toFixed(1) : '—',
      o.requiresHitl ? 'Sí' : 'No',
    ]),
    [40, 120, 70, 60, 80, 90, 50, 40],
    { fontSize: 8 },
  );

  // ── Predicciones de mayor probabilidad ────────────────────────────
  section(doc, 'Predicciones (top 20)');
  table(doc,
    ['ID', 'Equipo', 'Componente', 'Prob.', 'Ventana', 'Modelo', 'Fecha'],
    data.predictionsDetail.slice(0, 20).map((p) => [
      `#${p.predictionId}`,
      p.equipmentName ?? '—',
      p.component ?? '—',
      `${(p.failureProbability * 100).toFixed(1)}%`,
      `${p.windowDays ?? 7}d`,
      p.modelVersion ?? '—',
      fmtDate(p.createdAt),
    ]),
    [40, 130, 80, 50, 50, 90, 100],
    { fontSize: 8 },
  );

  // ── Pie ───────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED)
    .text('Documento generado automáticamente por MaintainPredict AI · WF-03', 40, doc.page.height - 40, {
      align: 'center', width: doc.page.width - 80,
    });

  doc.end();
  return doc;
}

// ── Helpers de layout ─────────────────────────────────────────────
function section(doc: PDFKit.PDFDocument, title: string) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(BLUE).fontSize(12).text(title.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveTo(40, doc.y + 2).lineTo(doc.page.width - 40, doc.y + 2).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.moveDown(0.4).fillColor(DARK).fontSize(10);
}

function kpiRow(doc: PDFKit.PDFDocument, items: { label: string; value: string; target: string }[]) {
  const colW = (doc.page.width - 80) / items.length;
  const y = doc.y;
  items.forEach((it, i) => {
    const x = 40 + i * colW;
    doc.fillColor(MUTED).fontSize(8).text(it.label, x, y, { width: colW - 10 });
    doc.fillColor(DARK).fontSize(14).text(it.value, x, y + 12, { width: colW - 10 });
    doc.fillColor(MUTED).fontSize(7).text(it.target, x, y + 30, { width: colW - 10 });
  });
  doc.y = y + 46;
}

function table(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
  opts: { fontSize?: number } = {},
) {
  const fontSize = opts.fontSize ?? 9;
  const startX = 40;
  const rowH = fontSize + 6;

  const drawRow = (cells: string[], isHeader: boolean) => {
    const y = doc.y;
    let x = startX;
    cells.forEach((c, i) => {
      doc.fillColor(isHeader ? '#ffffff' : DARK).fontSize(fontSize)
        .text(c, x + 3, y + 3, { width: widths[i] - 6, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    const bg = isHeader ? BLUE : (doc.y / rowH) % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), rowH).fillOpacity(isHeader ? 1 : 0.35).fill(bg).fillOpacity(1);
    // Redibujar el texto (fill cubre)
    x = startX;
    cells.forEach((c, i) => {
      doc.fillColor(isHeader ? '#ffffff' : DARK).fontSize(fontSize)
        .text(c, x + 3, y + 3, { width: widths[i] - 6, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    doc.y = y + rowH;
  };

  if (doc.y > doc.page.height - 100) doc.addPage();
  drawRow(headers, true);
  rows.forEach((r) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); drawRow(headers, true); }
    drawRow(r, false);
  });
  doc.moveDown(0.6);
}
