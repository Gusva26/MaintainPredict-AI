import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pg } from '../lib/db/client';
import { embedMany } from '../lib/rag/embeddings';

/**
 * Vectoriza la base de conocimiento (`kb_maintenance`).
 *
 * Por defecto solo rellena los documentos que tienen `embedding IS NULL`.
 * Con `KB_RESEED=1` regenera TODOS los vectores (necesario al cambiar de
 * proveedor de embeddings, p. ej. OpenAI → Gemini, porque los espacios
 * vectoriales no son comparables entre proveedores).
 *
 *   docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/seed-kb-embeddings.ts'
 *   docker compose exec -T -e KB_RESEED=1 web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/seed-kb-embeddings.ts'
 */
async function main() {
  const reseed = process.env.KB_RESEED === '1';

  if (reseed) {
    console.log('KB_RESEED=1 → se regeneran TODOS los vectores de kb_maintenance');
  } else {
    console.log('Checking for un-embedded documents in kb_maintenance...');
  }

  const rows = (await db.execute(
    reseed
      ? sql`SELECT doc_id, title, content FROM kb_maintenance ORDER BY doc_id`
      : sql`SELECT doc_id, title, content FROM kb_maintenance WHERE embedding IS NULL ORDER BY doc_id`,
  )) as unknown as { doc_id: number; title: string; content: string }[];

  console.log(`→ ${rows.length} documentos pendientes de vectorizar`);

  if (rows.length > 0) {
    const vectors = await embedMany(
      rows.map((r) => `${r.title}\n\n${r.content}`),
      'RETRIEVAL_DOCUMENT',
    );

    for (const [i, r] of rows.entries()) {
      const lit = `[${vectors[i].join(',')}]`;
      await db.execute(sql`
        UPDATE kb_maintenance SET embedding = ${lit}::vector WHERE doc_id = ${r.doc_id}
      `);
      console.log(`✓ Vectorizado doc #${r.doc_id}: ${r.title}`);
    }
  }

  await pg.end();
  console.log('Knowledge Base vectorization completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
