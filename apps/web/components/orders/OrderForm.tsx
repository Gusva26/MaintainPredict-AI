'use client';
import { useState } from 'react';
import { apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function OrderForm({ equipmentId, onCreated }: { equipmentId: number; onCreated?: () => void }) {
  const [form, setForm] = useState({ estimated_downtime_h: 2, priority: 'medium' as const, notes: '' });
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await apiPost<{ orderId: number; requiresHitl: boolean }>('/api/orders', {
        equipment_id: equipmentId,
        estimated_downtime_h: form.estimated_downtime_h,
        priority: form.priority,
        notes: form.notes,
      });
      toast.success(`Orden #${res.data.orderId} creada`, { description: res.data.requiresHitl ? 'Requiere HITL.' : undefined });
      onCreated?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Nueva orden manual</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          Parada estimada (h)
          <Input type="number" min={0} step={0.5} value={form.estimated_downtime_h}
            onChange={(e) => setForm({ ...form, estimated_downtime_h: Number(e.target.value) })} />
        </label>
        <label className="block text-sm">
          Prioridad
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
            className="h-9 w-full rounded border border-input bg-background px-3 text-sm">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label className="block text-sm">
          Notas
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded border border-input bg-background p-2 text-sm" />
        </label>
        <Button onClick={submit} disabled={loading}>{loading ? 'Creando…' : 'Crear orden'}</Button>
      </CardContent>
    </Card>
  );
}
