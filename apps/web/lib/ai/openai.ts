import OpenAI from 'openai';
import { env } from '@/lib/env';

/**
 * Valores de ejemplo de `.env.example`: no deben crear cliente.
 * (No se filtra por prefijo porque cada proveedor usa el suyo: `sk-` OpenAI,
 * `sk-or-v1-` OpenRouter, `gsk_` Groq…)
 */
const PLACEHOLDER_KEYS = new Set([
  'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'sk-mock-or-real-openai-api-key-here',
]);

/**
 * Cliente OpenAI compartido por los agentes (Predictor/Planner) y el RAG.
 *
 * `OPENAI_BASE_URL` permite apuntar a proveedores compatibles con la API de
 * OpenAI (p. ej. OpenRouter: https://openrouter.ai/api/v1). Si no se define, se
 * usa el endpoint oficial de OpenAI.
 *
 * Si no hay clave configurada devuelve `null`: la IA es un realce, no un
 * requisito, así que los agentes siguen operando en modo determinista.
 */
export const openai =
  env.OPENAI_API_KEY && !PLACEHOLDER_KEYS.has(env.OPENAI_API_KEY)
    ? new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      })
    : null;
