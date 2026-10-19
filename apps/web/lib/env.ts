import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().default('postgresql://mp_user:mp_pass_change_me@localhost:5432/maintainpredict'),
  JWT_SECRET: z.string().min(32).default('change_me_super_secret_at_least_32_chars_long'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_REFRESH_SECRET: z.string().min(32).default('change_me_refresh_secret_32_chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  OPENAI_API_KEY: z.string().optional(),
  // URL base opcional para proveedores compatibles con OpenAI (p. ej. OpenRouter).
  // Se normaliza la cadena vacía a `undefined` para poder dejarla en blanco en .env.
  OPENAI_BASE_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  ),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIM: z.coerce.number().default(1536),
  // Embeddings del RAG vía Google Gemini (capa gratuita). Tiene prioridad sobre
  // OPENAI_* para vectorizar; ver lib/rag/embeddings.ts. Se normaliza la cadena
  // vacía a `undefined` para poder dejarla en blanco en .env.
  GEMINI_API_KEY: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_SERVICE_API_KEY: z.string().default('ml_internal_key_change_me'),
  SMTP_HOST: z.string().default('mailhog'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  SMTP_PASS: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  SMTP_FROM: z.string().default('maintainpredict@local'),
  ERP_BASE_URL: z.string().url().default('http://localhost:9001'),
  ERP_API_KEY: z.string().default('erp_key'),
  SCADA_BASE_URL: z.string().url().default('http://localhost:9000'),
  SCADA_API_KEY: z.string().default('scada_key'),
  // ─── Integraciones ────────────────────────────────────────────────
  // `mock` (def): todo simulado. `real`: exige credenciales/productos reales.
  INTEGRATIONS_MODE: z.enum(['mock', 'real']).default('mock'),
  // `log` (def): dry-run, solo registra. `mock`: pasarela simulada. `twilio`: SMS real.
  SMS_PROVIDER: z.enum(['log', 'mock', 'twilio']).default('log'),
  SMS_BASE_URL: z.string().url().default('http://localhost:9002'),
  SMS_ACCOUNT_SID: z.string().optional(),
  SMS_AUTH_TOKEN: z.string().optional(),
  SMS_FROM: z.string().default('+15550000000'),
  // Corte de las llamadas a integraciones externas (ms).
  INTEGRATION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // ─── Agentes (fase E) ─────────────────────────────────────────────
  // Corte por intento de las llamadas al microservicio ML (ms). Es interno y
  // rápido: si no responde en este plazo, el agente no debe bloquear la petición.
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  // Reintentos ADICIONALES al llamar al servicio ML (2 ⇒ 3 intentos en total).
  // El LLM NO se reintenta a propósito: si falla, se cae al plan/relato de
  // respaldo de inmediato (más rápido y más barato).
  AGENT_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  // Corte de cada llamada al LLM (ms). Más holgado que el ML porque generar
  // texto es más lento, pero acotado para no dejar colgada la petición.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  // ─── Observabilidad (fase H) ──────────────────────────────────────
  // Umbral de "alta probabilidad" con el que se cuentan los falsos positivos (H.7).
  // Subirlo exige más confianza para alertar (menos FP, más riesgo de no actuar);
  // bajarlo alerta antes. El panel de observabilidad permite simular otros valores.
  FALSE_POSITIVE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export const env = schema.parse(process.env);
