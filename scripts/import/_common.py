"""Utilidades compartidas por los importadores de `scripts/import/`.

Los importadores son herramientas **opcionales** de operación: no forman parte de la
aplicación ni de CI, y solo hacen falta si se quiere cargar un dataset público real
(catálogo en `data/README.md`).

Principios que respetan todos los importadores:

* **`--dry-run` primero.** Sin `--dry-run` escriben; con él leen y validan el fichero,
  imprimen lo que harían y no abren conexión a la base.
* **Idempotencia.** Comprueban si el dataset ya está cargado (por el prefijo de nombre de
  los equipos) y no vuelven a insertarlo salvo `--force`.
* **Conexión explícita.** El DSN sale de `.env` (mismas variables que la app) y por defecto
  apunta a `localhost`, para poder lanzarlos desde el host. Si `.env` trae
  `POSTGRES_HOST=postgres` (el nombre del servicio en Docker), usa `--host localhost`.
* **Volumen acotado.** Aceptan `--limit` y (donde aplica) comprimen el histórico a los
  últimos N días, para que los datos importados caigan dentro de las ventanas de 30 días
  que usan el dashboard y `/observability`.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Iterable, Iterator, Sequence

ROOT = Path(__file__).resolve().parents[2]

# Windows: la consola usa cp1252 por defecto y revienta al imprimir '⚠️' o '→'.
# Se fuerza UTF-8 (con reemplazo) para que los importadores funcionen desde el host.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):  # pragma: no cover - streams sin reconfigure
        pass


def load_env(path: Path | None = None) -> dict[str, str]:
    """Lee `KEY=VALUE` de `.env` (sin dependencias). No pisa lo que ya esté en el entorno."""
    env_path = Path(path) if path else ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for raw in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def dsn(host: str | None = None) -> str:
    """Construye el DSN de PostgreSQL a partir de `.env` (o del entorno)."""
    env = load_env()
    host = host or os.getenv("POSTGRES_HOST") or "localhost"
    port = os.getenv("POSTGRES_PORT") or env.get("POSTGRES_PORT") or "5432"
    db = os.getenv("POSTGRES_DB") or env.get("POSTGRES_DB") or "maintainpredict"
    user = os.getenv("POSTGRES_USER") or env.get("POSTGRES_USER") or "mp_user"
    password = os.getenv("POSTGRES_PASSWORD") or env.get("POSTGRES_PASSWORD") or ""
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def common_parser(description: str, default_path: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="Leer y validar el dataset sin escribir nada en la base")
    parser.add_argument("--path", default=default_path,
                        help=f"Ruta del fichero o carpeta del dataset (por defecto {default_path})")
    parser.add_argument("--host", default=None,
                        help="Host de PostgreSQL si se ejecuta fuera de Docker (por defecto localhost)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Procesar solo las primeras N filas (para pruebas)")
    parser.add_argument("--force", action="store_true",
                        help="Importar aunque el dataset ya esté cargado")
    return parser


def connect(args):  # pragma: no cover - requiere psycopg2 y una base viva
    """Abre la conexión. Importa psycopg2 solo aquí, para que `--dry-run` funcione sin él."""
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        sys.exit("Falta psycopg2. Instálalo con:  pip install psycopg2-binary")
    import psycopg2

    return psycopg2.connect(dsn(args.host))


def chunks(iterable: Iterable[Sequence], size: int = 5000) -> Iterator[list[Sequence]]:
    buf: list[Sequence] = []
    for item in iterable:
        buf.append(item)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


def already_imported(cur, name_prefix: str) -> bool:
    """¿Hay equipos con ese prefijo? Sirve de marca de 'ya importado'."""
    cur.execute("SELECT count(*) FROM equipment WHERE name LIKE %s", (f"{name_prefix}%",))
    return cur.fetchone()[0] > 0


def insert_readings(cur, rows: Iterable[Sequence], chunk_size: int = 5000) -> int:
    """Inserta lecturas por lotes con `execute_values` (mucho más rápido que fila a fila)."""
    from psycopg2.extras import execute_values

    total = 0
    for batch in chunks(rows, chunk_size):
        execute_values(
            cur,
            "INSERT INTO readings (sensor_id, value, quality, recorded_at) VALUES %s",
            batch,
            page_size=chunk_size,
        )
        total += len(batch)
    return total


def quality_for(value: float, minimum: float | None, maximum: float | None) -> str:
    """Misma regla que `fn_classify_reading` (Fase A): fuera de rango → 'suspect'."""
    if minimum is not None and value < minimum:
        return "suspect"
    if maximum is not None and value > maximum:
        return "suspect"
    return "good"


def fail_missing(path: Path) -> None:
    sys.exit(
        f"No encuentro {path}.\n"
        f"Descarga el dataset según data/README.md y vuelve a intentarlo, o usa --path."
    )
