import type OpenAI from 'openai';
import { env } from '@/lib/env';
import { openai } from '@/lib/ai/openai';
import { technicianAvailability } from '@/lib/db/queries';
import { getIntegrations } from '@/lib/integrations';
import { retrieve } from '@/lib/rag/retriever';
import { withLlmTimeout } from '@/lib/agents/resilience';

export type PlannerInput = {
  predictionId: number;
  equipmentId: number;
  component: string;
  failureProbability: number;
  window: string;
  criticality: string;
  downtimeCostEurH: number;
};

export type PlannerOutput = {
  /** Lo sella el endpoint cuando ya ha insertado la orden (el agente no conoce el id). */
  order_id: number | null;
  scheduled_date: string;
  technician_id: number | null;
  technician_name: string | null;
  /** Alias de `technician_name`: así lo pide la forma de salida de la spec §5. */
  technician: string | null;
  parts: { sku: string; qty: number }[];
  estimated_downtime_h: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Regla HITL ya aplicada: `true` ⇒ la orden nace en `pending_approval`. */
  requires_hitl: boolean;
  /** Estado con el que debe crearse la orden. Siempre calculado aquí, nunca por el LLM. */
  status: 'planned' | 'pending_approval';
  reasoning: string;
  rag_sources: { doc_id: number; title: string; similarity: number }[];
};

/** Salida interna de la herramienta `schedule_order`: el borrador ya validado. */
export type DraftOrder = Omit<PlannerOutput, 'order_id' | 'technician' | 'reasoning' | 'rag_sources'> & {
  reasoning?: string;
};

/** Propuesta sin validar (viene del LLM o del plan determinista). */
export type DraftProposal = {
  scheduled_date?: unknown;
  technician_id?: unknown;
  technician_name?: unknown;
  parts?: unknown;
  estimated_downtime_h?: unknown;
  priority?: unknown;
  reasoning?: unknown;
};

export const HITL_THRESHOLD_H = 4;

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

type Technician = { userId: number; fullName: string; openOrders: number };
type ErpPart = { sku: string; qty: number; lead_days: number };
type ProductionWindow = { date: string; criticality_ok: boolean };

type SealingContext = {
  input: PlannerInput;
  techs: Technician[];
  parts: ErpPart[];
  windows: ProductionWindow[];
};

// ── Herramientas ──────────────────────────────────────────────────────

async function tool_get_technician_availability(): Promise<Technician[]> {
  // Comparte consulta con GET /api/technicians para que UI y agente no discrepen.
  return technicianAvailability();
}

async function tool_check_parts(component: string): Promise<ErpPart[]> {
  // Conexión con el ERP a través del adaptador de integraciones (ver lib/integrations).
  // El adaptador degrada al catálogo local si el ERP no responde, así que esta
  // función nunca lanza y la planificación no se rompe por un proveedor caído.
  const parts = await getIntegrations().erp.checkParts(component);
  return parts.map((p) => ({ sku: p.sku, qty: p.qty, lead_days: p.lead_days }));
}

/**
 * Ventanas de parada permitidas. Es una **consulta interna** (fase E): las
 * ventanas se le pasan al LLM como contexto y `schedule_order` valida contra
 * ellas, así que no hace falta gastar una ronda de herramienta en pedirlas.
 */
function productionWindows(criticality: string): ProductionWindow[] {
  const now = new Date();
  return [1, 2, 3, 5, 7].map((d) => {
    const date = new Date(now.getTime() + d * 86400_000);
    date.setHours(2, 0, 0, 0); // Ventana nocturna a las 02:00
    return {
      date: date.toISOString(),
      criticality_ok: criticality !== 'critical' || d >= 2,
    };
  });
}

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_technician_availability',
      description: 'Lista técnicos con su carga actual de órdenes abiertas.',
      parameters: {
        type: 'object',
        properties: { criticality: { type: 'string' } },
        required: ['criticality'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_parts',
      description: 'Devuelve repuestos necesarios y lead time desde el catálogo ERP.',
      parameters: {
        type: 'object',
        properties: { component: { type: 'string' } },
        required: ['component'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'schedule_order',
      description:
        'Valida y sella el borrador de la orden de mantenimiento: comprueba que el técnico existe ' +
        '(si no, asigna el de menor carga), encaja la fecha en una ventana de parada permitida, ' +
        'normaliza los repuestos contra el ERP y APLICA LA REGLA HITL ' +
        `(parada > ${HITL_THRESHOLD_H} h ⇒ la orden requiere aprobación humana). ` +
        'Llámala SIEMPRE antes de responder: devuelve el borrador definitivo, incluido su estado.',
      parameters: {
        type: 'object',
        properties: {
          scheduled_date: {
            type: ['string', 'null'],
            description: 'Fecha propuesta en ISO 8601; null para que se elija una ventana válida.',
          },
          technician_id: {
            type: ['integer', 'null'],
            description: 'userId del técnico elegido; null para el de menor carga.',
          },
          parts: {
            type: ['array', 'null'],
            description: 'Repuestos necesarios; null para usar los del ERP.',
            items: {
              type: 'object',
              properties: {
                sku: { type: ['string', 'null'] },
                qty: { type: ['integer', 'null'] },
              },
            },
          },
          estimated_downtime_h: {
            type: ['number', 'null'],
            description: `Parada estimada en horas (más de ${HITL_THRESHOLD_H} dispara el HITL).`,
          },
          priority: { type: ['string', 'null'], enum: [...PRIORITIES, null] },
          reasoning: { type: ['string', 'null'], description: 'Justificación breve de la decisión.' },
        },
        // A propósito NO hay `required` y todos los campos admiten `null`:
        //  1. Algunos proveedores (Groq) validan los argumentos contra este esquema
        //     y rechazan la petición ENTERA con un 400 si el modelo manda `null`
        //     en un campo no anulable. Eso tumbaba el plan del LLM.
        //  2. `sealDraftOrder()` rellena y corrige lo que falte, así que el modelo
        //     solo necesita proponer; no puede romper nada por omitir un campo.
      },
    },
  },
];

// ── Reglas de negocio (una sola ruta para todas las procedencias) ─────

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

/**
 * Aplica las reglas de negocio sobre una propuesta (del LLM o determinista) y
 * devuelve el borrador definitivo.
 *
 * Es la **única** ruta que decide `requires_hitl` y `status`: así el LLM no
 * puede "aprobarse" una parada larga ni inventarse un estado. Se exporta para
 * poder probar las reglas sin red ni LLM.
 */
export function sealDraftOrder(proposal: DraftProposal, ctx: SealingContext): DraftOrder {
  const { input, techs, parts: erpParts, windows } = ctx;

  // Técnico: solo se acepta uno real del listado; si no, el de menor carga
  // (`technicianAvailability()` ya viene ordenado de menos a más carga).
  const wantedId = Number(proposal.technician_id);
  const tech = techs.find((t) => t.userId === wantedId) ?? techs[0] ?? null;

  // Ventana: solo se acepta la fecha propuesta si cae en una ventana **válida
  // para la criticidad** del equipo (no se programa producción crítica). Si no,
  // se encaja en la primera ventana permitida.
  const wantedDate = typeof proposal.scheduled_date === 'string' ? proposal.scheduled_date : '';
  const window =
    windows.find((w) => w.criticality_ok && sameDay(w.date, wantedDate)) ??
    windows.find((w) => w.criticality_ok) ??
    windows[0];

  const proposedDowntime = Number(proposal.estimated_downtime_h);
  const downtime = Number.isFinite(proposedDowntime) && proposedDowntime > 0 ? proposedDowntime : 3;

  const rawParts = Array.isArray(proposal.parts)
    ? (proposal.parts as { sku?: unknown; qty?: unknown }[])
    : [];
  const cleanParts = rawParts
    .map((p) => ({
      sku: String(p?.sku ?? '').trim(),
      qty: Math.max(1, Math.round(Number(p?.qty ?? 1))),
    }))
    .filter((p) => p.sku.length > 0 && Number.isFinite(p.qty));

  const priority = PRIORITIES.includes(proposal.priority as (typeof PRIORITIES)[number])
    ? (proposal.priority as DraftOrder['priority'])
    : input.failureProbability > 0.9
      ? 'critical'
      : input.failureProbability > 0.7
        ? 'high'
        : 'medium';

  const requires_hitl = downtime > HITL_THRESHOLD_H;
  const reasoning =
    typeof proposal.reasoning === 'string' && proposal.reasoning.trim() ? proposal.reasoning.trim() : undefined;

  return {
    scheduled_date: window?.date ?? new Date().toISOString(),
    technician_id: tech?.userId ?? null,
    technician_name: tech?.fullName ?? null,
    parts: cleanParts.length ? cleanParts : erpParts.map((p) => ({ sku: p.sku, qty: p.qty })),
    estimated_downtime_h: downtime,
    priority,
    requires_hitl,
    status: requires_hitl ? 'pending_approval' : 'planned',
    reasoning,
  };
}

/** Propuesta del plan determinista (sin LLM). Pasa por las mismas reglas. */
function deterministicProposal(input: PlannerInput, erpParts: ErpPart[], windows: ProductionWindow[]): DraftProposal {
  const window = windows.find((w) => w.criticality_ok) ?? windows[0];
  const downtime = input.criticality === 'critical' ? 5.5 : input.failureProbability > 0.85 ? 4.5 : 2.5;

  return {
    scheduled_date: window?.date,
    // Sin `technician_id`: el de menor carga (la consulta ya viene ordenada así).
    parts: erpParts.map((p) => ({ sku: p.sku, qty: p.qty })),
    estimated_downtime_h: downtime,
    reasoning: 'Plan determinista: sin LLM disponible. Técnico de menor carga y ventana nocturna válida.',
  };
}

/** Sella la salida del agente con el id real de la orden una vez persistida. */
export function sealPlannerOutput(plan: PlannerOutput, orderId: number): PlannerOutput {
  return { ...plan, order_id: orderId };
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function runPlannerAgent(input: PlannerInput): Promise<PlannerOutput> {
  const ragDocs = await retrieve({
    query: `Procedimiento mantenimiento preventivo ${input.component} criticidad ${input.criticality}`,
    topK: 3,
  });
  const ragSources = ragDocs.map((d) => ({
    doc_id: d.doc_id,
    title: d.title,
    similarity: Number(d.similarity),
  }));

  const techs = await tool_get_technician_availability();
  const parts = await tool_check_parts(input.component);
  const windows = productionWindows(input.criticality);

  const ctx: SealingContext = { input, techs, parts, windows };

  const finish = (draft: DraftOrder, reasoning?: string): PlannerOutput => ({
    order_id: null,
    ...draft,
    reasoning: reasoning ?? draft.reasoning ?? 'Plan determinista (sin LLM).',
    technician: draft.technician_name,
    rag_sources: ragSources,
  });

  const deterministic = () => finish(sealDraftOrder(deterministicProposal(input, parts, windows), ctx));

  // Se copia a una constante local: dentro del cierre de `withLlmTimeout` TypeScript
  // no conserva el estrechamiento de tipo del import.
  const client = openai;
  if (!client) return deterministic();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        `Eres MaintenancePlannerAgent. Planificas mantenimiento industrial. ` +
        `Responde SIEMPRE en español. ` +
        `Reglas: NO programar durante producción crítica; HITL obligatorio si la parada supera ${HITL_THRESHOLD_H} h; ` +
        `priorizar el técnico con menor carga; usar repuestos del ERP con lead time suficiente. ` +
        `Llama SIEMPRE a la herramienta schedule_order con tu propuesta antes de responder: ella valida ` +
        `técnico, ventana y repuestos, y aplica la regla HITL (no inventes el estado de aprobación). ` +
        `Después devuelve SOLO un objeto JSON con: { scheduled_date, technician_id, technician_name, ` +
        `parts: [{sku, qty}], estimated_downtime_h, priority, reasoning }.`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        prediccion: input,
        ventanas_de_parada_disponibles: windows,
        contexto_rag: ragDocs.map((d) => ({ titulo: d.title, extracto: d.content.slice(0, 250) })),
      }),
    },
  ];

  // Algunos modelos (p. ej. los de razonamiento de Groq) piden UNA herramienta
  // por turno, así que 3 rondas no bastaban para llegar al JSON final. Damos
  // margen y forzamos que la última ronda responda sin herramientas: así el
  // plan textual está garantizado y no caemos al fallback determinista.
  const MAX_ROUNDS = 5;
  let sealed: DraftOrder | null = null;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const lastRound = i === MAX_ROUNDS - 1;
    let r;
    try {
      // El LLM no se reintenta (ver lib/agents/resilience.ts) y se corta por
      // tiempo para que un proveedor colgado no bloquee la petición.
      r = await withLlmTimeout(() =>
        client.chat.completions.create({
          model: env.OPENAI_CHAT_MODEL,
          messages,
          tools: TOOLS,
          tool_choice: lastRound ? 'none' : 'auto',
          temperature: 0.1,
          // Acota la reserva de tokens del proveedor (evita rechazos por "máx. posible"
          // y limita el coste). Margen suficiente para razonamiento + JSON de salida.
          max_tokens: 1200,
        }),
      );
    } catch (err) {
      // La IA es un realce, no un requisito: si el LLM falla (clave ausente/no válida,
      // red, cuota agotada, timeout…) la planificación NO debe romperse. Caemos al plan determinista.
      console.warn('[runPlannerAgent] LLM no disponible, usando plan determinista:', err);
      break;
    }

    const msg = r.choices[0]?.message;
    if (!msg) break;

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const args = parseArgs(call.function.arguments);
        let result: unknown;
        switch (call.function.name) {
          case 'get_technician_availability': result = techs; break;
          case 'check_parts': result = parts; break;
          case 'schedule_order':
            // El borrador sellado se guarda: si el modelo no llega a emitir el
            // JSON final, se aprovecha este en vez de tirar el trabajo hecho.
            sealed = sealDraftOrder(args, ctx);
            result = sealed;
            break;
          default: result = { error: 'herramienta desconocida' };
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const content = msg.content ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) break;

    try {
      const parsed = JSON.parse(jsonMatch[0]) as DraftProposal;
      // Las reglas se aplican aquí también: el LLM propone, el código decide.
      return finish(sealDraftOrder(parsed, ctx), parsed.reasoning as string | undefined);
    } catch {
      break;
    }
  }

  if (sealed) return finish(sealed);
  return deterministic();
}
