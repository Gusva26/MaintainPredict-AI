'use client';
import { useState } from 'react';
import { apiPost } from '@/lib/api/client';
import { passwordPolicyErrors } from '@/lib/auth/password-policy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordChecklist } from './PasswordChecklist';
import { useSession } from '@/lib/hooks/useSession';
import { toast } from 'sonner';

export function ChangePasswordForm() {
  const { session } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);

  const policyErrors = passwordPolicyErrors(next);
  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && policyErrors.length === 0 && next === repeat;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/auth/change-password', { current_password: current, new_password: next });
      toast.success('Contraseña actualizada', { description: 'La sesión sigue activa con el token renovado.' });
      setCurrent(''); setNext(''); setRepeat('');
    } catch (err: any) {
      toast.error('No se pudo cambiar la contraseña', { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 text-sm">
          <div className="text-xs text-muted-foreground">
            {session ? `Sesión de ${session.name} (${session.email})` : 'Cargando sesión…'}
          </div>

          <div className="space-y-1">
            <label htmlFor="current_password" className="text-xs font-medium">Contraseña actual</label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="new_password" className="text-xs font-medium">Nueva contraseña</label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="password-rules"
            />
            <div id="password-rules" className="pt-1">
              <PasswordChecklist password={next} />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="repeat_password" className="text-xs font-medium">Repite la nueva contraseña</label>
            <Input
              id="repeat_password"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">Las dos contraseñas no coinciden.</p>}
          </div>

          <Button type="submit" disabled={!ready || saving}>
            {saving ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
