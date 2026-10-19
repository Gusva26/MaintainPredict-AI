import { env } from '@/lib/env';
import { openai as client } from '@/lib/ai/openai';

/** Dimensiones del vector guardado en `kb_maintenance.embedding` (pgvector). */
const DIM = env.OPENAI_EMBEDDING_DIM;

/**
 * Rol del texto que se vectoriza. Gemini lo aprovecha para optimizar el espacio
 * vectorial (`RETRIEVAL_DOCUMENT` para la base de conocimiento, `RETRIEVAL_QUERY`
 * para las consultas). Otros proveedores lo ignoran.
 */
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Valores de ejemplo de `.env.example`: no deben activar un proveedor real. */
const PLACEHOLDER_KEYS = new Set([
  'your_google_ai_studio_key',
  'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'sk-mock-or-real-openai-api-key-here',
]);

const geminiApiKey =
  env.GEMINI_API_KEY && !PLACEHOLDER_KEYS.has(env.GEMINI_API_KEY) ? env.GEMINI_API_KEY : null;

/**
 * Modo offline: embedding determinista de 1536 dimensiones para tests y
 * entornos sin cuota. No es semántico, pero es coherente consigo mismo.
 */
function deterministicEmbedding(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % DIM] += text.charCodeAt(i) / 1000;
  }
  return normalize(vec);
}

/** Normaliza a norma 1 (Gemini no garantiza vectores unitarios al truncar a 1536). */
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
}

type GeminiBatchResponse = { embeddings?: { values?: number[] }[] };

/**
 * Embeddings de Google Gemini (`batchEmbedContents`). No es un endpoint
 * compatible con OpenAI, por eso se llama con `fetch` en lugar del SDK.
 */
async function geminiEmbed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const res = await fetch(
    `${env.GEMINI_BASE_URL}/models/${env.GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey as string,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${env.GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType: task,
          outputDimensionality: DIM,
        })),
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as GeminiBatchResponse;
  const vectors = (data.embeddings ?? []).map((e) => normalize(e.values ?? []));
  if (vectors.length !== texts.length) {
    throw new Error(`Gemini embeddings: esperaba ${texts.length} vectores y recibí ${vectors.length}`);
  }
  return vectors;
}

/**
 * Vectoriza uno o varios textos. Cadena de proveedores:
 *   1. Gemini (capa gratuita; `GEMINI_API_KEY`) — proveedor por defecto del RAG.
 *   2. Proveedor compatible con OpenAI (`OPENAI_API_KEY` + `OPENAI_BASE_URL`).
 *   3. Embedding determinista local (modo offline).
 * La IA es un realce, no un requisito: si un proveedor falla se degrada al
 * siguiente en lugar de romper la recuperación.
 */
export async function embedMany(
  texts: string[],
  task: EmbedTask = 'RETRIEVAL_QUERY',
): Promise<number[][]> {
  if (geminiApiKey) {
    try {
      return await geminiEmbed(texts, task);
    } catch (err) {
      console.warn('[embed] Gemini no disponible, probando el siguiente proveedor:', err);
    }
  }

  if (client) {
    try {
      const r = await client.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts,
        dimensions: DIM,
      });
      return r.data.map((d) => d.embedding);
    } catch (err) {
      // Sin cuota o con clave no válida seguimos funcionando con el embedding
      // determinista en lugar de romper el RAG.
      console.warn('[embed] OpenAI embeddings no disponible, usando embedding determinista:', err);
    }
  }

  return texts.map(deterministicEmbedding);
}

/** Vectoriza un único texto (por defecto, como consulta de recuperación). */
export async function embed(text: string, task: EmbedTask = 'RETRIEVAL_QUERY'): Promise<number[]> {
  const [vec] = await embedMany([text], task);
  return vec;
}
