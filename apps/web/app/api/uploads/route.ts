import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { requirePermission } from '@/lib/auth/session';
import { fail, handleError, created } from '@/lib/http/response';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/data/uploads';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    await requirePermission('orders:complete');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail(422, 'Archivo requerido');
    if (file.size > MAX_SIZE) return fail(413, 'Máximo 5 MB');
    const mime = file.type || 'application/octet-stream';
    if (!mime.startsWith('image/')) return fail(415, 'Solo imágenes');

    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const name = `${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, name), buf);

    const url = `/uploads/${name}`;
    return created({ url }, {
      what: 'Foto subida y almacenada.',
      how: `Se guardó como ${name} (${(file.size / 1024).toFixed(0)} KB).`,
      decision: 'Adjuntar la URL a la orden al completarla.',
    });
  } catch (e) { return handleError(e); }
}
