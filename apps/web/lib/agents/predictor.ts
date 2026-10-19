import { env } from '@/lib/env';
import { openai } from '@/lib/ai/openai';
import { retrieve } from '@/lib/rag/retriever';
import { fetchWithTimeout } from '@/lib/http/fetch';
import { withRetry, withLlmTimeout } from '@/lib/agents/resilience';

export type PredictorInput = {
  equipmentId: number;
  equipmentName: string;
  equipmentType: string;
  criticality: string;
  signals: { type: string; value: number; min: number; max: number; unit?: string }[];
  recentHistory?: { component: string; probability: number; createdAt: string }[];
};

export type PredictorOutput = {
  equipment_id: number;
  failure_probability: number;
  window: string;
  component: string;
  model_version: string;
  explanation: string;
  top_features: { feature: string; value: number }[];
  rag_sources: { doc_id: number; title: string; similarity: number }[];
};

/**
 * Llama al microservicio ML (FastAPI) para obtener la probabilidad e inferencia base.
 *
 * Resiliencia (fase E): cada intento se corta por tiempo con `AbortController`
 * (así se cierra la conexión de verdad, no solo se abandona la promesa) y se
 * reintenta con backoff exponencial. Si se agotan los intentos, se degrada al
 * respaldo analítico: esta función **nunca lanza**, porque el agente debe
 * devolver siempre una predicción.
 */
async function callMlService(input: PredictorInput) {
  try {
    return await withRetry(
      async () => {
        const res = await fetchWithTimeout(`${env.ML_SERVICE_URL}/ml/predict-failure`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': env.ML_SERVICE_API_KEY
          },
          body: JSON.stringify({
            equipment_id: input.equipmentId,
            equipment_type: input.equipmentType,
            criticality: input.criticality,
            signals: input.signals,
          }),
          cache: 'no-store',
          // El corte del fetch es 500 ms más corto que el de `withRetry` para
          // que gane el AbortController y el error diga "abortado" en vez de
          // "tiempo de espera agotado" (el race queda solo como red de seguridad).
          timeoutMs: env.AGENT_TIMEOUT_MS,
        });

        if (!res.ok) throw new Error(`el servicio ML respondió ${res.status}`);
        return await res.json();
      },
      { label: 'ML predict-failure', timeoutMs: env.AGENT_TIMEOUT_MS + 500 },
    );
  } catch (err) {
    console.warn(
      '[callMlService] servicio ML no disponible tras los reintentos; se usa el respaldo analítico:',
      err,
    );
  }

  // Fallback analítico si el microservicio de ML no está activo
  const dev = input.signals.reduce((acc, s) => {
    const span = Math.max(s.max - s.min, 1);
    const r = (s.value - s.min) / span;
    return Math.max(acc, Math.max(0, r - 0.7) / 0.3);
  }, 0);

  const highestDevSignal = input.signals.reduce((prev, curr) => {
    const prevRatio = (prev.value - prev.min) / Math.max(prev.max - prev.min, 1);
    const currRatio = (curr.value - curr.min) / Math.max(curr.max - curr.min, 1);
    return currRatio > prevRatio ? curr : prev;
  }, input.signals[0] || { type: 'vibration', value: 0, min: 0, max: 1 });

  const compMap: Record<string, string> = {
    vibration: 'bearing',
    temperature: 'motor',
    pressure: 'pump',
    current: 'motor',
    rpm: 'belt',
  };

  return {
    equipment_id: input.equipmentId,
    failure_probability: Number(Math.min(0.99, 0.15 + dev * 0.8).toFixed(3)),
    component: compMap[highestDevSignal?.type] ?? 'unknown',
    window: '7d',
    model_version: 'fallback-heuristic-v1',
    top_features: input.signals.map(s => ({
      feature: `${s.type}.ratio`,
      value: Number(((s.value - s.min) / Math.max(s.max - s.min, 1)).toFixed(3))
    })),
  };
}

/**
 * Texto de respaldo cuando no hay LLM (o falla): explica la predicción con las
 * lecturas que se han tenido en cuenta y **cita las fuentes RAG recuperadas**
 * (título y similitud), como pide la fase E de la especificación.
 *
 * Se exporta para poder probarlo sin red.
 */
export function buildFallbackExplanation(
  input: PredictorInput,
  ml: { failure_probability: number; component?: string; window?: string },
  rag: { title: string; similarity: number }[] = [],
): string {
  const base =
    `Probabilidad ${(ml.failure_probability * 100).toFixed(1)}% de falla en el componente ` +
    `"${ml.component ?? 'unknown'}" dentro de ${ml.window ?? '7d'}. Lecturas consideradas: ` +
    input.signals.map((s) => `${s.type}=${s.value.toFixed(2)}${s.unit ?? ''}`).join(', ') + '.';

  if (!rag.length) {
    return `${base} Explicación generada sin LLM: no había documentación recuperada que citar.`;
  }

  const fuentes = rag.map((d) => `"${d.title}" (similitud ${d.similarity.toFixed(2)})`).join('; ');
  return `${base} Documentación consultada: ${fuentes}.`;
}

/**
 * Reclasifica y genera explicación con LLM + RAG.
 *
 * El LLM se corta por tiempo pero **no se reintenta**: si falla, se devuelve el
 * relato de respaldo (que ya cita el RAG) para no encarecer ni retrasar la ruta.
 */
async function explainWithLlm(
  input: PredictorInput,
  ml: any,
  rag: { title: string; content: string; similarity: number }[],
): Promise<string> {
  const fallback = buildFallbackExplanation(input, ml, rag);

  // Se copia a una constante local: dentro del cierre de `withLlmTimeout` TypeScript
  // no conserva el estrechamiento de tipo del import.
  const client = openai;
  if (!client) return fallback;

  const sys = `Eres el PredictorAgent de MaintainPredict AI. Explicas en 3 frases máximo, en español técnico claro, por qué el modelo predice un fallo, qué componente y qué acción inmediata recomienda. Cita normativa si aparece.`;

  const user = JSON.stringify({
    equipo: { id: input.equipmentId, nombre: input.equipmentName, tipo: input.equipmentType, criticidad: input.criticality },
    prediccion_ml: ml,
    lecturas: input.signals,
    historial: input.recentHistory ?? [],
    conocimiento_recuperado: rag.map((d) => ({ titulo: d.title, extracto: d.content.slice(0, 300), similitud: d.similarity })),
  });

  try {
    const r = await withLlmTimeout(() =>
      client.chat.completions.create({
        model: env.OPENAI_CHAT_MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        // Margen amplio: los modelos de razonamiento gastan tokens "pensando" antes
        // de emitir el contenido, así que 260 se quedaba corto.
        max_tokens: 600,
      }),
    );

    return r.choices[0]?.message?.content?.trim() || fallback;
  } catch (err) {
    console.warn('[explainWithLlm] LLM no disponible; se usa el relato de respaldo con citas RAG:', err);
    return fallback;
  }
}

export async function runPredictorAgent(input: PredictorInput): Promise<PredictorOutput> {
  // 1. Recuperar contexto RAG relevante
  const ragQuery = `Falla ${input.equipmentType} ${input.equipmentName} componente vibración temperatura normativa ISO 10816`;
  const ragDocs = await retrieve({ query: ragQuery, topK: 4 });

  // 2. Predicción base de ML
  const ml = await callMlService(input);

  // 3. Explicación natural con LLM y contexto normativo
  const explanation = await explainWithLlm(
    input,
    ml,
    ragDocs.map((d) => ({
      title: d.title,
      content: d.content,
      similarity: Number(d.similarity),
    }))
  );

  return {
    equipment_id: input.equipmentId,
    failure_probability: Number(ml.failure_probability),
    window: ml.window ?? '7d',
    component: ml.component ?? 'unknown',
    model_version: ml.model_version ?? 'unknown',
    explanation,
    top_features: ml.top_features ?? [],
    rag_sources: ragDocs.map((d) => ({
      doc_id: d.doc_id,
      title: d.title,
      similarity: Number(d.similarity)
    })),
  };
}
