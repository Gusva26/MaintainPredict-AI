'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function CompletionPanel({ onSubmit }: { onSubmit: (p: { notes?: string; photos?: string[]; false_positive?: boolean }) => Promise<void> | void }) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isFp, setIsFp] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <Card>
      <CardHeader><CardTitle>Completar orden</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="w-full rounded border border-input bg-background p-2 text-sm"
          rows={3}
          placeholder="Notas de intervención…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            className="h-9 flex-1 rounded border border-input bg-background px-3 text-sm"
            placeholder="URL de foto (o subir en App Técnico)"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => { if (photoUrl) { setPhotos([...photos, photoUrl]); setPhotoUrl(''); } }}>
            Añadir
          </Button>
        </div>
        {photos.length > 0 && <ul className="text-xs text-muted-foreground">{photos.map((p) => <li key={p}>{p}</li>)}</ul>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFp} onChange={(e) => setIsFp(e.target.checked)} />
          No se encontró falla real (marcar como falso positivo)
        </label>
        <Button onClick={async () => { setLoading(true); await onSubmit({ notes, photos, false_positive: isFp }); setLoading(false); }} disabled={loading}>
          {loading ? 'Guardando…' : 'Marcar como completada'}
        </Button>
      </CardContent>
    </Card>
  );
}
