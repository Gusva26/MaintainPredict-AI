import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
} from 'docx';
import type { WeeklyReportData } from './aggregate';

const BLUE = '2563EB';
const DARK = '0F172A';
const MUTED = '64748B';

function filterLabel(data: WeeklyReportData): string {
  const parts: string[] = [];
  if (data.filters.equipmentId) parts.push(`equipo #${data.filters.equipmentId}`);
  if (data.filters.technicianId) parts.push(`técnico #${data.filters.technicianId}`);
  return parts.length ? parts.join(' + ') : 'ninguno (todos los equipos y técnicos)';
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: BLUE, color: 'auto' } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: !!opts.header, color: opts.header ? 'FFFFFF' : DARK, size: 18 })],
    })],
  });
}

function table(headers: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
    },
    rows: [
      new TableRow({ children: headers.map((h, i) => cell(h, { header: true, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths?.[i] })) })),
    ],
  });
}

export async function buildWeeklyDocx(data: WeeklyReportData): Promise<Buffer> {
  const kpi = Object.fromEntries(data.businessKpis.map((k) => [k.name, k.value]));
  const metric = Object.fromEntries(data.modelMetrics.map((m) => [m.metric, m.value]));

  const doc = new Document({
    creator: 'MaintainPredict AI',
    title: 'Reporte semanal MaintainPredict AI',
    sections: [
      {
        properties: {},
        children: [
          // Portada
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'MaintainPredict AI', bold: true, color: BLUE, size: 48 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Reporte semanal operacional y de gestión', color: MUTED, size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `Periodo: ${new Date(data.window.start).toLocaleDateString('es-ES')} → ${new Date(data.window.end).toLocaleDateString('es-ES')}   ·   Generado: ${new Date(data.generatedAt).toLocaleString('es-ES')}`,
              color: MUTED, size: 18,
            })],
          }),
          new Paragraph({ text: '' }),

          // Alcance: qué se cuenta exactamente (H.3)
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Qué incluye este informe', color: BLUE })] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Filtros aplicados: ', bold: true, size: 18 }),
              new TextRun({ text: filterLabel(data), size: 18 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Órdenes: `, bold: true, size: 18 }),
              new TextRun({
                text: `${data.counts.ordersTotal} creadas en el periodo; la tabla «Órdenes por estado» las cuenta por estado y «Predicciones» resume alertas.`,
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Predicciones: `, bold: true, size: 18 }),
              new TextRun({
                text: `${data.counts.predictionsTotal} en el periodo; la tabla de predicciones lista las 20 de mayor probabilidad.`,
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `KPIs y métricas del modelo: `, bold: true, size: 18 }),
              new TextRun({
                text: 'agregados de la ventana (no se filtran por equipo ni técnico, son indicadores globales de la planta).',
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: '' }),

          // KPIs
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'KPIs de negocio', color: BLUE })] }),
          table(
            ['KPI', 'Valor', 'Objetivo'],
            [
              ['Paradas evitadas', `${(kpi.downtime_avoided_h ?? 0).toFixed(0)} h`, '−60%'],
              ['Ahorro estimado', `€${(kpi.cost_savings_eur ?? 0).toLocaleString('es-ES')}`, '−30%'],
              ['Precisión del modelo', `${((metric.precision ?? 0) * 100).toFixed(1)}%`, '85%'],
              ['Disponibilidad', `${((kpi.availability ?? 0) * 100).toFixed(1)}%`, '—'],
            ],
            [3000, 3000, 2500],
          ),
          new Paragraph({ text: '' }),

          // Órdenes por estado
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Órdenes por estado', color: BLUE })] }),
          table(['Estado', 'Nº'], data.ordersByStatus.map((o) => [o.status, String(o.n)]), [4000, 2000]),
          new Paragraph({ text: '' }),

          // Top equipos en riesgo
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Top equipos en riesgo', color: BLUE })] }),
          table(
            ['Equipo', 'Criticidad', 'Prob. media', 'Prob. máx', 'Nº pred.'],
            data.topPredictions.map((p) => [
              p.name ?? `#${p.equipmentId}`,
              p.criticality ?? '—',
              `${(p.avgProb * 100).toFixed(1)}%`,
              `${(p.maxProb * 100).toFixed(1)}%`,
              String(p.n),
            ]),
            [3000, 1500, 1500, 1500, 1500],
          ),
          new Paragraph({ text: '' }),

          // Predicciones top 20
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Predicciones (top 20)', color: BLUE })] }),
          table(
            ['ID', 'Equipo', 'Componente', 'Prob.', 'Ventana', 'Modelo'],
            data.predictionsDetail.slice(0, 20).map((p) => [
              `#${p.predictionId}`,
              p.equipmentName ?? '—',
              p.component ?? '—',
              `${(p.failureProbability * 100).toFixed(1)}%`,
              `${p.windowDays ?? 7}d`,
              p.modelVersion ?? '—',
            ]),
            [800, 2500, 1800, 900, 900, 1800],
          ),

          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: 'Documento generado automáticamente por MaintainPredict AI · WF-03',
              color: MUTED, size: 16,
            })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
