#!/usr/bin/env python3
"""Importa documentación de **OSHA** (u otra normativa pública) a la base de conocimiento.

Qué hace
--------
Recorre una carpeta con documentos `.txt`, `.md` o `.html` y crea un documento de
`kb_maintenance` por fichero con `category = 'normativa'`. El `embedding` se deja **NULL** a
propósito: después se vectoriza con el script que ya usa la aplicación, que rellena
justamente los documentos sin vector:

    docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'

Así el importador es SQL puro y no depende de la API de embeddings.

Uso
---
    python scripts/import/import-osha-kb.py --dry-run
    python scripts/import/import-osha-kb.py --path data/datasets/osha
    python scripts/import/import-osha-kb.py --limit 20 --dry-run

Requiere: `pip install psycopg2-binary`.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from _common import common_parser, connect

EXTENSIONS = {".txt", ".md", ".html", ".htm"}
MAX_CHARS = 20_000  # un documento de KB no necesita más; el RAG trocea por su cuenta
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"[ \t]+")


def clean_text(raw: str, is_html: bool) -> str:
    text = raw
    if is_html:
        text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text)
        text = TAG_RE.sub(" ", text)
        text = html.unescape(text)
    text = SPACE_RE.sub(" ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> int:
    parser = common_parser(__doc__ or "", "data/datasets/osha")
    args = parser.parse_args()

    folder = Path(args.path)
    if not folder.exists():
        sys.exit(
            f"No encuentro {folder}.\n"
            "Descarga la normativa según data/README.md y vuelve a intentarlo, o usa --path."
        )

    files = [p for p in sorted(folder.rglob("*")) if p.suffix.lower() in EXTENSIONS]
    if args.limit is not None:
        files = files[: args.limit]
    print(f"→ {len(files)} documentos encontrados en {folder}")

    if not files:
        print("No hay documentos que importar (¿carpeta vacía?).")
        return 0

    if args.dry_run:
        print("--dry-run: no se escribe nada.")
        for path in files[:10]:
            print(f"   {path.name}  ({path.stat().st_size // 1024} KB)")
        if len(files) > 10:
            print(f"   … y {len(files) - 10} más")
        print("   Después de importar, vectoriza con:  pnpm db:seed:kb")
        return 0

    conn = connect(args)
    cur = conn.cursor()
    inserted = 0
    skipped = 0

    for path in files:
        raw = path.read_text(encoding="utf-8", errors="replace")
        content = clean_text(raw, path.suffix.lower() in {".html", ".htm"})
        if len(content) < 80:
            skipped += 1
            continue

        title = path.stem.replace("_", " ").replace("-", " ").strip()[:200]
        cur.execute("SELECT 1 FROM kb_maintenance WHERE title = %s", (title,))
        if cur.fetchone():
            skipped += 1
            continue

        cur.execute(
            """
            INSERT INTO kb_maintenance (title, category, content, metadata)
            VALUES (%s, 'normativa', %s, %s::jsonb)
            """,
            (
                title,
                content[:MAX_CHARS],
                '{"source": "OSHA/public", "imported_by": "import-osha-kb.py"}',
            ),
        )
        inserted += 1
        if inserted % 20 == 0:
            print(f"  → {inserted} documentos importados")

    conn.commit()
    cur.close()
    conn.close()
    print(f"OSHA importado: {inserted} documentos nuevos, {skipped} omitidos (ya existían o eran vacíos).")
    print("Ahora vectorízalos con:  pnpm db:seed:kb")
    return 0


if __name__ == "__main__":
    sys.exit(main())
