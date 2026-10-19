#!/usr/bin/env bash
# Genera placeholders PNG si no existen iconos PWA
set -euo pipefail
DIR="apps/web/public/icons"
mkdir -p "$DIR"
for size in 192 512; do
  f="$DIR/icon-$size.png"
  [ -f "$f" ] || {
    printf '\x89PNG\r\n\x1a\n' > "$f"
    echo "→ placeholder $f (reemplazar por icono real)"
  }
done
[ -f "$DIR/icon-maskable.png" ] || cp "$DIR/icon-512.png" "$DIR/icon-maskable.png"
