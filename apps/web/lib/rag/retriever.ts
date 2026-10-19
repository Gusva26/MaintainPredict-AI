import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { embed } from './embeddings';

export type KbDoc = {
  doc_id: number;
  title: string;
  category: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type RetrieveOptions = {
  query: string;
  topK?: number;
  category?: 'manual' | 'historico_falla' | 'normativa';
  minSimilarity?: number;
};

/**
 * Búsqueda semántica sobre kb_maintenance usando pgvector (distancia coseno <=>).
 * similarity = 1 - (embedding <=> vecLiteral)
 *
 * Fase A.7: la consulta se delega en la función `fn_kb_search_similar` (objeto de base
 * de datos de la Fase A) en lugar de escribir el SQL de pgvector aquí. Así la regla
 * «similitud = 1 - distancia coseno» vive en un único sitio: si mañana se cambia a
 * distancia euclídea o a un índice HNSW, se toca la función y no el código de la app.
 */
export async function retrieve(opts: RetrieveOptions): Promise<KbDoc[]> {
  const topK = opts.topK ?? 5;
  const minSim = opts.minSimilarity ?? 0.15;

  try {
    const vec = await embed(opts.query, 'RETRIEVAL_QUERY');
    const vecLiteral = `[${vec.join(',')}]`;

    const rows = await db.execute(sql`
      SELECT doc_id, title, category, content, metadata, similarity
      FROM fn_kb_search_similar(
        ${vecLiteral}::vector,
        ${topK},
        ${opts.category ?? null}::varchar
      )
    `) as unknown as KbDoc[];

    return rows.filter((r) => Number(r.similarity) >= minSim);
  } catch (err) {
    console.warn('[retrieve] Semantic search fallback to ILIKE text search:', err);
    // Fallback gracioso a búsqueda por palabras clave si pgvector no está vectorizado
    const textQuery = `%${opts.query.split(' ')[0] || ''}%`;
    const rows = await db.execute(sql`
      SELECT
        doc_id,
        title,
        category,
        content,
        metadata,
        0.80 AS similarity
      FROM kb_maintenance
      WHERE title ILIKE ${textQuery} OR content ILIKE ${textQuery}
      LIMIT ${topK}
    `) as unknown as KbDoc[];
    return rows;
  }
}

export async function insertKbDoc(params: {
  title: string;
  category?: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ doc_id: number }> {
  const vec = await embed(`${params.title}\n\n${params.content}`, 'RETRIEVAL_DOCUMENT');
  const vecLiteral = `[${vec.join(',')}]`;

  const result = await db.execute(sql`
    INSERT INTO kb_maintenance (title, category, content, metadata, embedding)
    VALUES (${params.title}, ${params.category ?? null}, ${params.content},
            ${JSON.stringify(params.metadata ?? {})}::jsonb, ${vecLiteral}::vector)
    RETURNING doc_id
  `);

  return (result as unknown as { doc_id: number }[])[0];
}
