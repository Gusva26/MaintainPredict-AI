'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const DEFAULT_ITEMS = [
  'Bloqueo y etiquetado (LOTO) aplicado',
  'Inspección visual sin anomalías',
  'Vibración medida y registrada',
  'Temperatura medida y registrada',
  'Lubricación verificada',
  'Repuestos sustituidos según orden',
];

export function ChecklistForm({ orderId, onSubmit }: { orderId: number; onSubmit: (notes: string) => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  const toggle = (label: string) => setChecked((c) => ({ ...c, [label]: !c[label] }));
  const done = DEFAULT_ITEMS.filter((i) => checked[i]).length;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{done}/{DEFAULT_ITEMS.length} pasos completados</div>
      {DEFAULT_ITEMS.map((item) => (
        <label key={item} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} />
          {item}
        </label>
      ))}
      <textarea rows={2} placeholder="Notas adicionales…" value={notes} onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded border border-input bg-background p-2 text-sm" />
      <Button size="sm" disabled={done < DEFAULT_ITEMS.length}
        onClick={() => onSubmit(`Checklist ${done}/${DEFAULT_ITEMS.length} · ${notes}`)}>
        Completar orden
      </Button>
    </div>
  );
}
