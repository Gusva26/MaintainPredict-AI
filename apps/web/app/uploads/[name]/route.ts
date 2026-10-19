import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireSession } from '@/lib/auth/session';
import { fail, handleError } from '@/lib/http/response';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/data/uploads';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

/** Sirve una foto subida a /api/uploads. Requiere sesión (no es público). */
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  try {
    await requireSession();
    const name = path.basename(params.name); // evita path traversal
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const buf = await readFile(path.join(UPLOAD_DIR, name));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return fail(404, 'Archivo no encontrado');
    return handleError(e);
  }
}
