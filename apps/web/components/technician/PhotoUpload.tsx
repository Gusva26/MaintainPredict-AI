'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PhotoUpload({ orderId, onUploaded }: { orderId: number; onUploaded: (url: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/uploads', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error('Error de subida');
      const { data } = await res.json();
      setPreview(URL.createObjectURL(f));
      onUploaded(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">Adjuntar foto</label>
      <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} />
      {preview && <img src={preview} alt="Previsualización" className="h-24 w-24 rounded object-cover" />}
      <div className="text-xs text-muted-foreground">Orden #{orderId}</div>
    </div>
  );
}
