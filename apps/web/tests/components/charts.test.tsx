import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { SensorChart } from '@/components/equipment/SensorChart';
import { FailureChart } from '@/components/dashboard/FailureChart';
import type { Sensor, Reading, Prediction } from '@/lib/api/types';

// ── Recharts necesita medir el contenedor: damos un tamaño fijo en jsdom ──
const SIZE = { width: 800, height: 320 };

// FailureChart obtiene los datos con SWR; lo mockeamos con un fixture.
const predictions: Prediction[] = [
  { predictionId: 1, equipmentId: 10, component: 'rodamiento', failureProbability: 0.82, windowDays: 7, modelVersion: 'rf-v1.0.0', explanation: null, createdAt: '2026-10-01T00:00:00.000Z' },
  { predictionId: 2, equipmentId: 11, component: 'motor', failureProbability: 0.35, windowDays: 7, modelVersion: 'rf-v1.0.0', explanation: null, createdAt: '2026-10-01T00:00:00.000Z' },
];

vi.mock('swr', () => ({
  default: () => ({ data: { data: { items: predictions } }, isLoading: false, mutate: vi.fn() }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      const rect = { ...SIZE, top: 0, left: 0, right: SIZE.width, bottom: SIZE.height, x: 0, y: 0 };
      this.cb(
        [
          {
            target,
            contentRect: rect,
            borderBoxSize: [{ inlineSize: SIZE.width, blockSize: SIZE.height }],
            contentBoxSize: [{ inlineSize: SIZE.width, blockSize: SIZE.height }],
          },
        ] as unknown as ResizeObserverEntry[],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => SIZE.width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => SIZE.height });
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...SIZE, top: 0, left: 0, right: SIZE.width, bottom: SIZE.height, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => vi.restoreAllMocks());

/** Renderiza capturando lo que va a `console.error` (React avisa por ahí). */
function renderCapturingErrors(node: ReactNode) {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const utils = render(node);
  const errors = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
  return { ...utils, errors };
}

const sensors: Sensor[] = [
  { sensorId: 1, equipmentId: 10, type: 'vibration', unit: 'mm/s', status: 'active', minThreshold: null, maxThreshold: null },
  { sensorId: 2, equipmentId: 10, type: 'temperature', unit: '°C', status: 'active', minThreshold: null, maxThreshold: null },
];

const readings: Reading[] = [
  { readingId: 1, sensorId: 1, value: '2.1', quality: 'good', recordedAt: '2026-10-01T10:00:00.000Z' },
  { readingId: 2, sensorId: 2, value: '61.2', quality: 'good', recordedAt: '2026-10-01T10:00:00.000Z' },
  { readingId: 3, sensorId: 1, value: '2.4', quality: 'good', recordedAt: '2026-10-01T11:00:00.000Z' },
  { readingId: 4, sensorId: 2, value: '63.8', quality: 'good', recordedAt: '2026-10-01T11:00:00.000Z' },
];

describe('Gráficos (Recharts)', () => {
  it('SensorChart (LineChart) monta un <svg> y no emite el warning de defaultProps', () => {
    const { container, errors } = renderCapturingErrors(<SensorChart sensors={sensors} readings={readings} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(errors).not.toMatch(/defaultProps/);
  });

  it('SensorChart dibuja los umbrales del sensor como líneas de referencia (H-K6)', () => {
    const conUmbrales: Sensor[] = [
      { sensorId: 1, equipmentId: 10, type: 'vibration', unit: 'mm/s', status: 'active', minThreshold: '1.5', maxThreshold: '3.0' },
    ];
    const { container } = renderCapturingErrors(
      <SensorChart sensors={conUmbrales} readings={readings.filter((r) => r.sensorId === 1)} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    // Las etiquetas solo existen si se pintan las ReferenceLine de mínimo y máximo.
    expect(container.textContent).toContain('vibration mín');
    expect(container.textContent).toContain('vibration máx');
  });

  it('FailureChart (BarChart) monta un <svg> y no emite el warning de defaultProps', () => {
    const { container, errors } = renderCapturingErrors(<FailureChart />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(errors).not.toMatch(/defaultProps/);
  });

  it('LineChart con ReferenceLine/domain/unit (ObservabilityView) renderiza sin avisos', () => {
    const data = [
      { t: '01/10', v: 86 },
      { t: '02/10', v: 84 },
      { t: '03/10', v: 88 },
    ];
    const { container, errors } = renderCapturingErrors(
      <LineChart width={800} height={280} data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="t" fontSize={11} />
        <YAxis domain={[50, 100]} fontSize={11} unit="%" />
        <Tooltip formatter={(v: any) => [`${v}%`, 'Precisión']} />
        <ReferenceLine y={85} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'Objetivo 85%', fontSize: 11, fill: '#16a34a' }} />
        <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(errors).not.toMatch(/defaultProps/);
  });
});
