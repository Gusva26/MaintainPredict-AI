import { describe, it, expect } from 'vitest';
import {
  ErpHttpAdapter,
  ScadaHttpAdapter,
  MockSmsGatewayAdapter,
  TwilioSmsAdapter,
  SmtpEmailAdapter,
  LOCAL_PARTS_CATALOG,
  getIntegrations,
} from '../lib/integrations';
import { modeOf, fetchWithTimeout } from '../lib/integrations/support';

// Puerto sin servicio: fuerza el camino de degradación sin depender de la red real.
const UNREACHABLE = 'http://127.0.0.1:59999';
const FAST = 400; // ms

describe('integración ERP', () => {
  it('degrada al catálogo local cuando el ERP no responde', async () => {
    const erp = new ErpHttpAdapter(UNREACHABLE, 'k', FAST);
    const parts = await erp.checkParts('bearing');

    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0].source).toBe('catalog');
    expect(parts.map((p) => p.sku)).toEqual(LOCAL_PARTS_CATALOG.bearing.map((p) => p.sku));
  });

  it('usa el catálogo "unknown" para componentes desconocidos', async () => {
    const erp = new ErpHttpAdapter(UNREACHABLE, 'k', FAST);
    const parts = await erp.checkParts('componente-inexistente');
    expect(parts[0].sku).toBe(LOCAL_PARTS_CATALOG.unknown[0].sku);
  });

  it('health() informa del fallo sin lanzar', async () => {
    const erp = new ErpHttpAdapter(UNREACHABLE, 'k', FAST);
    const h = await erp.health();

    expect(h.kind).toBe('erp');
    expect(h.adapter).toBe('erp-http');
    expect(h.ok).toBe(false);
    expect(h.detail).toBeTruthy();
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('integración SCADA', () => {
  it('health() informa del fallo sin lanzar', async () => {
    const scada = new ScadaHttpAdapter(UNREACHABLE, 'k', FAST);
    const h = await scada.health();
    expect(h.kind).toBe('scada');
    expect(h.ok).toBe(false);
  });

  it('getLatestReadings() lanza si el SCADA responde con error', async () => {
    const scada = new ScadaHttpAdapter(UNREACHABLE, 'k', FAST);
    await expect(scada.getLatestReadings(1)).rejects.toThrow();
  });
});

describe('integración SMS', () => {
  it('en modo log no llama a la red y devuelve sent=true', async () => {
    const sms = new MockSmsGatewayAdapter(UNREACHABLE, '+15550000000', true, FAST);
    const r = await sms.send('+34600000000', 'Prueba');

    expect(r.sent).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(sms.adapter).toBe('sms-log');

    const h = await sms.health();
    expect(h.ok).toBe(true);
  });

  it('en modo pasarela mock informa del fallo si la pasarela no responde', async () => {
    const sms = new MockSmsGatewayAdapter(UNREACHABLE, '+15550000000', false, FAST);
    expect(sms.adapter).toBe('sms-mock-gateway');

    await expect(sms.send('+34600000000', 'Prueba')).rejects.toThrow();
    expect((await sms.health()).ok).toBe(false);
  });

  it('Twilio sin credenciales válidas no se declara sano', async () => {
    const twilio = new TwilioSmsAdapter('ACxxxxxxxx', 'xxxxxxxx', '+15550000000', FAST);
    const h = await twilio.health();

    expect(h.adapter).toBe('sms-twilio');
    expect(h.kind).toBe('sms');
    expect(h.ok).toBe(false);
    await expect(twilio.send('+34600000000', 'Prueba')).rejects.toThrow(/credenciales/);
  });
});

describe('integración Email', () => {
  it('health() devuelve un estado bien formado (nunca lanza)', async () => {
    const email = new SmtpEmailAdapter(UNREACHABLE, 1025, undefined, undefined, 'mp@local');
    const h = await email.health();

    expect(h.kind).toBe('email');
    expect(h.adapter).toBe('email-smtp');
    expect(typeof h.ok).toBe('boolean');
  });
});

describe('factoría de integraciones', () => {
  it('expone los 4 dominios y agrega sus estados', async () => {
    const integrations = getIntegrations();

    expect(new Set([integrations.erp.kind, integrations.scada.kind, integrations.sms.kind, integrations.email.kind]))
      .toEqual(new Set(['erp', 'scada', 'sms', 'email']));

    const statuses = await integrations.health();
    expect(statuses).toHaveLength(4);
    for (const s of statuses) {
      expect(s).toHaveProperty('ok');
      expect(s).toHaveProperty('latencyMs');
      expect(s.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('utilidades de integración', () => {
  it('modeOf detecta entornos simulados', () => {
    expect(modeOf('http://mock-erp:9001')).toBe('mock');
    expect(modeOf('http://localhost:9000')).toBe('mock');
    expect(modeOf('mailhog')).toBe('mock');
    expect(modeOf('https://erp.acme.com')).toBe('real');
  });

  it('fetchWithTimeout corta la petición si el host no responde', async () => {
    // 10.255.255.1 no es enrutable: la petición se queda colgada hasta el corte.
    await expect(fetchWithTimeout('http://10.255.255.1:8080/x', { timeoutMs: 300 })).rejects.toThrow();
  });
});
