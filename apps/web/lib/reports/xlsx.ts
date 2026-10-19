import ExcelJS from 'exceljs';
import type { WeeklyReportData } from './aggregate';

const BLUE = 'FF2563EB';
const HEADER = (ws: ExcelJS.Worksheet, row: number) => {
  ws.getRow(row).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
};

function filterLabel(data: WeeklyReportData): string {
  const parts: string[] = [];
  if (data.filters.equipmentId) parts.push(`equipo #${data.filters.equipmentId}`);
  if (data.filters.technicianId) parts.push(`técnico #${data.filters.technicianId}`);
  return parts.length ? parts.join(' + ') : 'sin filtros (todos los equipos y técnicos)';
}

/**
 * Construye un workbook XLSX con 5 hojas, **todas con autofiltro** (H.2).
 *
 * Para que el autofiltro tenga sentido en la portada, el resumen ya no mezcla títulos sueltos
 * con dos bloques de datos: porta un encabezado fijo (periodo, generado, filtros y qué se ha
 * contado) y **una sola tabla** con `Bloque | Nombre | Valor | Objetivo` sobre la que se aplica
 * el filtro. Devuelve el buffer.
 */
export async function buildWeeklyXlsx(data: WeeklyReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MaintainPredict AI';
  wb.created = new Date();

  // ── Hoja 1: Resumen ───────────────────────────────────────────────
  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 20 }, { width: 30 }, { width: 18 }, { width: 18 }];
  summary.addRow(['MaintainPredict AI — Reporte semanal']).font = { bold: true, size: 16 };
  summary.addRow(['Periodo', new Date(data.window.start).toLocaleDateString('es-ES'),
                  '→', new Date(data.window.end).toLocaleDateString('es-ES')]);
  summary.addRow(['Generado', new Date(data.generatedAt).toLocaleString('es-ES')]);
  summary.addRow(['Filtros', filterLabel(data)]);
  summary.addRow(['Órdenes en la ventana', data.counts.ordersTotal,
                  'En el detalle', data.counts.ordersIncluded]);
  summary.addRow(['Predicciones en la ventana', data.counts.predictionsTotal,
                  'En el detalle', data.counts.predictionsIncluded]);
  summary.addRow([]);

  const headerRow = summary.rowCount + 1;
  summary.addRow(['Bloque', 'Nombre', 'Valor', 'Objetivo']);
  HEADER(summary, headerRow);

  for (const k of data.businessKpis) {
    const objetivo = k.name === 'downtime_avoided_h' ? '−60 %'
                   : k.name === 'cost_savings_eur' ? '−30 %'
                   : k.name === 'availability' ? '—' : '';
    summary.addRow(['KPI de negocio', k.name, k.value, objetivo]);
  }
  for (const m of data.modelMetrics) {
    summary.addRow(['Métrica del modelo', m.metric, m.value,
                    m.metric === 'precision' ? data.kpiTargets.modelPrecision : '']);
  }
  const lastRow = summary.rowCount;
  summary.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: 4 } };

  // ── Hoja 2: Órdenes por estado ────────────────────────────────────
  const byStatus = wb.addWorksheet('Órdenes por estado');
  byStatus.columns = [{ header: 'Estado', key: 's', width: 22 }, { header: 'Nº', key: 'n', width: 10 }];
  HEADER(byStatus, 1);
  data.ordersByStatus.forEach((o) => byStatus.addRow({ s: o.status, n: o.n }));
  byStatus.autoFilter = { from: 'A1', to: 'B1' };

  // ── Hoja 3: Órdenes detalle ───────────────────────────────────────
  const orders = wb.addWorksheet('Órdenes detalle');
  orders.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Equipo', key: 'eq', width: 28 },
    { header: 'Estado', key: 'st', width: 18 },
    { header: 'Prioridad', key: 'pr', width: 12 },
    { header: 'Programada', key: 'sc', width: 22 },
    { header: 'Técnico', key: 'tc', width: 22 },
    { header: 'Parada (h)', key: 'dh', width: 12 },
    { header: 'HITL', key: 'hitl', width: 8 },
  ];
  HEADER(orders, 1);
  data.ordersDetail.forEach((o) => orders.addRow({
    id: o.orderId, eq: o.equipmentName, st: o.status, pr: o.priority,
    sc: o.scheduledDate ? new Date(o.scheduledDate).toLocaleString('es-ES') : '',
    tc: o.technicianName ?? '', dh: o.estimatedDowntimeH ?? 0, hitl: o.requiresHitl ? 'Sí' : 'No',
  }));
  orders.autoFilter = { from: 'A1', to: 'H1' };

  // ── Hoja 4: Predicciones ──────────────────────────────────────────
  const preds = wb.addWorksheet('Predicciones');
  preds.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Equipo', key: 'eq', width: 28 },
    { header: 'Componente', key: 'co', width: 18 },
    { header: 'Probabilidad', key: 'pb', width: 14 },
    { header: 'Ventana (d)', key: 'wd', width: 12 },
    { header: 'Modelo', key: 'mv', width: 18 },
    { header: 'Fecha', key: 'dt', width: 22 },
    { header: 'Alerta (>0.7)', key: 'al', width: 14 },
  ];
  HEADER(preds, 1);
  data.predictionsDetail.forEach((p) => preds.addRow({
    id: p.predictionId, eq: p.equipmentName, co: p.component,
    pb: p.failureProbability, wd: p.windowDays ?? 7, mv: p.modelVersion ?? '',
    dt: new Date(p.createdAt).toLocaleString('es-ES'),
    al: p.failureProbability > 0.7 ? 'Sí' : 'No',
  }));
  preds.autoFilter = { from: 'A1', to: 'H1' };

  // ── Hoja 5: Top equipos en riesgo ─────────────────────────────────
  const top = wb.addWorksheet('Top riesgo');
  top.columns = [
    { header: 'Equipo', key: 'eq', width: 28 },
    { header: 'Criticidad', key: 'cr', width: 14 },
    { header: 'Prob. media', key: 'av', width: 14 },
    { header: 'Prob. máx', key: 'mx', width: 14 },
    { header: 'Nº pred.', key: 'n', width: 12 },
  ];
  HEADER(top, 1);
  data.topPredictions.forEach((t) => top.addRow({
    eq: t.name, cr: t.criticality, av: t.avgProb, mx: t.maxProb, n: t.n,
  }));
  top.autoFilter = { from: 'A1', to: 'E1' };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
