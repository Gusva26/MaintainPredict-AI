import { describe, it, expect, beforeAll } from 'vitest';
import { aggregateWeeklyReport } from '../lib/reports/aggregate';
import { buildWeeklyPdf } from '../lib/reports/pdf';
import { buildWeeklyXlsx } from '../lib/reports/xlsx';
import { buildWeeklyDocx } from '../lib/reports/docx';

let data: Awaited<ReturnType<typeof aggregateWeeklyReport>>;

beforeAll(async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400_000);
  data = await aggregateWeeklyReport(start, end);
});

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('Reportes', () => {
  it('aggregate devuelve estructura esperada', () => {
    expect(data.window.start).toBeTruthy();
    expect(Array.isArray(data.ordersByStatus)).toBe(true);
    expect(Array.isArray(data.ordersDetail)).toBe(true);
    expect(Array.isArray(data.topPredictions)).toBe(true);
    expect(Array.isArray(data.modelMetrics)).toBe(true);
    expect(data.kpiTargets.modelPrecision).toBe(0.85);
  });

  it('PDF empieza con %PDF', async () => {
    const buf = await streamToBuffer(buildWeeklyPdf(data));
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('XLSX empieza con ZIP magic (PK)', async () => {
    const buf = await buildWeeklyXlsx(data);
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('DOCX empieza con ZIP magic (PK)', async () => {
    const buf = await buildWeeklyDocx(data);
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(buf.length).toBeGreaterThan(2000);
  });
});
