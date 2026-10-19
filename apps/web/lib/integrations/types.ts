// Contratos de las integraciones externas de MaintainPredict AI.
//
// El dominio (agentes, reportes, API) habla SIEMPRE contra estas interfaces, nunca
// contra `fetch` directo. Así el paso de mock a real es solo cambiar `INTEGRATIONS_MODE`
// y las credenciales en `.env` (ver `docs/INTEGRATIONS.md`).

export type IntegrationKind = 'erp' | 'scada' | 'sms' | 'email';

export type IntegrationMode = 'mock' | 'real';

export type HealthStatus = {
  kind: IntegrationKind;
  adapter: string;
  mode: IntegrationMode;
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  detail?: string;
};

export type ErpPart = {
  sku: string;
  qty: number;
  lead_days: number;
  name?: string;
  cost_eur?: number;
  in_stock?: boolean;
  /** `erp` si vino del sistema real; `catalog` si se degradó al catálogo local. */
  source: 'erp' | 'catalog';
};

export interface ErpClient {
  readonly kind: 'erp';
  readonly adapter: string;
  readonly mode: IntegrationMode;
  /** Repuestos necesarios para un componente, con lead time. Nunca lanza: degrada al catálogo. */
  checkParts(component: string): Promise<ErpPart[]>;
  health(): Promise<HealthStatus>;
}

export type ScadaReading = {
  sensorId: number;
  type: string;
  value: number;
  unit?: string;
  recordedAt: string;
};

export interface ScadaClient {
  readonly kind: 'scada';
  readonly adapter: string;
  readonly mode: IntegrationMode;
  getLatestReadings(equipmentId: number): Promise<ScadaReading[]>;
  health(): Promise<HealthStatus>;
}

export type SmsResult = { sent: boolean; provider: string; id?: string; dryRun?: boolean };

export interface SmsClient {
  readonly kind: 'sms';
  readonly adapter: string;
  readonly mode: IntegrationMode;
  send(to: string, message: string): Promise<SmsResult>;
  health(): Promise<HealthStatus>;
}

export type EmailMessage = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

export interface EmailClient {
  readonly kind: 'email';
  readonly adapter: string;
  readonly mode: IntegrationMode;
  send(message: EmailMessage): Promise<{ sent: boolean; provider: string }>;
  health(): Promise<HealthStatus>;
}

export interface Integrations {
  mode: IntegrationMode;
  erp: ErpClient;
  scada: ScadaClient;
  sms: SmsClient;
  email: EmailClient;
  /** Estado agregado de todos los adaptadores (nunca lanza). */
  health(): Promise<HealthStatus[]>;
}
