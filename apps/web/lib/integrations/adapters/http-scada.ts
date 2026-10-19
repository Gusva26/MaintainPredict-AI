// Adaptador SCADA (HTTP + API key). Compatible con el mock de `infra/mocks/scada`
// y con un SCADA real que exponga `GET /scada/equipment/:id/latest`.

import { env } from '@/lib/env';
import { fetchWithTimeout, modeOf, probe } from '../support';
import type { HealthStatus, ScadaClient, ScadaReading } from '../types';

export class ScadaHttpAdapter implements ScadaClient {
  readonly kind = 'scada' as const;
  readonly adapter = 'scada-http';
  readonly mode;

  constructor(
    private readonly baseUrl: string = env.SCADA_BASE_URL,
    private readonly apiKey: string = env.SCADA_API_KEY,
    private readonly timeoutMs: number = env.INTEGRATION_TIMEOUT_MS,
  ) {
    this.mode = modeOf(baseUrl);
  }

  async getLatestReadings(equipmentId: number): Promise<ScadaReading[]> {
    const res = await fetchWithTimeout(`${this.baseUrl}/scada/equipment/${equipmentId}/latest`, {
      headers: { 'x-api-key': this.apiKey },
      timeoutMs: this.timeoutMs,
    });
    if (!res.ok) throw new Error(`SCADA respondió HTTP ${res.status}`);
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({
      sensorId: Number(r.sensorId ?? r.sensor_id ?? 0),
      type: String(r.type ?? 'unknown'),
      value: Number(r.value ?? 0),
      unit: typeof r.unit === 'string' ? r.unit : undefined,
      recordedAt: String(r.recordedAt ?? r.recorded_at ?? new Date().toISOString()),
    }));
  }

  health(): Promise<HealthStatus> {
    return probe(this.kind, this.adapter, this.mode, async () => {
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { timeoutMs: this.timeoutMs });
      if (!res.ok) throw new Error(`SCADA respondió HTTP ${res.status}`);
    });
  }
}
