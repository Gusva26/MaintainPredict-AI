// Adaptador ERP (HTTP + API key). Compatible con el mock de `infra/mocks/erp`
// y con cualquier ERP real que exponga `POST /erp/check-parts`.

import { env } from '@/lib/env';
import { fetchWithTimeout, modeOf, probe } from '../support';
import type { ErpClient, ErpPart, HealthStatus } from '../types';

/** Catálogo local de último recurso: el ERP caído no debe romper la planificación. */
export const LOCAL_PARTS_CATALOG: Record<string, Omit<ErpPart, 'source'>[]> = {
  bearing: [{ sku: 'BRG-6205', qty: 2, lead_days: 1 }, { sku: 'LUB-EP2', qty: 1, lead_days: 0 }],
  motor: [{ sku: 'MTR-5KW', qty: 1, lead_days: 3 }, { sku: 'BRG-6206', qty: 2, lead_days: 1 }],
  pump: [{ sku: 'SEAL-PMP', qty: 1, lead_days: 2 }, { sku: 'IMP-PMP', qty: 1, lead_days: 5 }],
  belt: [{ sku: 'BLT-A45', qty: 1, lead_days: 1 }],
  valve: [{ sku: 'VLV-DN50', qty: 1, lead_days: 2 }],
  unknown: [{ sku: 'KIT-GEN', qty: 1, lead_days: 2 }],
};

export class ErpHttpAdapter implements ErpClient {
  readonly kind = 'erp' as const;
  readonly adapter = 'erp-http';
  readonly mode;

  constructor(
    private readonly baseUrl: string = env.ERP_BASE_URL,
    private readonly apiKey: string = env.ERP_API_KEY,
    private readonly timeoutMs: number = env.INTEGRATION_TIMEOUT_MS,
  ) {
    this.mode = modeOf(baseUrl);
  }

  async checkParts(component: string): Promise<ErpPart[]> {
    const key = (component || 'unknown').toLowerCase();
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/erp/check-parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({ component: key }),
        timeoutMs: this.timeoutMs,
      });
      if (res.ok) {
        const data = (await res.json()) as { parts?: Array<Record<string, unknown>> };
        if (Array.isArray(data.parts) && data.parts.length > 0) {
          return data.parts.map((p) => ({
            sku: String(p.sku),
            qty: Number(p.qty ?? 1),
            lead_days: Number(p.lead_days ?? 0),
            name: typeof p.name === 'string' ? p.name : undefined,
            cost_eur: p.cost_eur != null ? Number(p.cost_eur) : undefined,
            in_stock: typeof p.in_stock === 'boolean' ? p.in_stock : undefined,
            source: 'erp' as const,
          }));
        }
      }
    } catch {
      // Degradación silenciosa: se resuelve con el catálogo local.
    }
    return (LOCAL_PARTS_CATALOG[key] ?? LOCAL_PARTS_CATALOG.unknown).map((p) => ({
      ...p,
      source: 'catalog' as const,
    }));
  }

  health(): Promise<HealthStatus> {
    return probe(this.kind, this.adapter, this.mode, async () => {
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { timeoutMs: this.timeoutMs });
      if (!res.ok) throw new Error(`ERP respondió HTTP ${res.status}`);
    });
  }
}
