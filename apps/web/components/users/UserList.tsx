'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, apiPost, apiPatch } from '@/lib/api/client';
import { passwordPolicyErrors } from '@/lib/auth/password-policy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationBar } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { useSession } from '@/lib/hooks/useSession';
import { toast } from 'sonner';
import type { Paginated, Role, User } from '@/lib/api/types';

/**
 * Etiquetas por rol. Al ser un `Record<Role, string>`, si alguien añade un rol al
 * tipo `Role` esto deja de compilar hasta que se le ponga nombre: el desplegable no
 * puede quedarse sin una opción.
 */
const ROLE_LABELS: Record<Role, string> = {
  technician: 'Técnico',
  supervisor: 'Supervisor',
  planner: 'Planificador',
  admin: 'Administrador',
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function UserList() {
  const { session } = useSession();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [resetFor, setResetFor] = useState<number | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q) params.set('q', q);
  if (role) params.set('role', role);
  if (active) params.set('is_active', active);

  const { data, isLoading, mutate } = useSWR<{ data: Paginated<User> }>(
    `/api/users?${params}`,
    fetcher,
    { keepPreviousData: true },
  );
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  async function patch(u: User, body: Record<string, unknown>, mensaje: string) {
    setSavingId(u.userId);
    try {
      await apiPatch(`/api/users/${u.userId}`, body);
      toast.success(mensaje);
      setResetFor(null);
      mutate();
    } catch (e: any) {
      toast.error('No se pudo actualizar el usuario', { description: e.message });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            Usuarios
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Buscar por nombre o email"
                placeholder="Nombre o email"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="h-8 w-52"
              />
              <Select value={role || 'todos'} onValueChange={(v) => { setRole(v === 'todos' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 w-40 text-sm" aria-label="Filtrar por rol">
                  <SelectValue placeholder="Todos los roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los roles</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={active || 'todos'} onValueChange={(v) => { setActive(v === 'todos' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 w-44 text-sm" aria-label="Filtrar por estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="true">Solo activos</SelectItem>
                  <SelectItem value="false">Solo desactivados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No hay usuarios con esos filtros.</TableCell></TableRow>
              )}
              {items.map((u) => {
                const soyYo = session?.id === u.userId;
                const ocupado = savingId === u.userId;
                return (
                  <TableRow key={u.userId}>
                    <TableCell className="text-xs tabular-nums">#{u.userId}</TableCell>
                    <TableCell className="text-sm">
                      {u.fullName}
                      {soyYo && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell>
                      <select
                        aria-label={`Rol de ${u.fullName}`}
                        value={u.role}
                        disabled={ocupado}
                        title={soyYo ? 'No puedes cambiarte el rol a ti mismo' : undefined}
                        onChange={(e) => patch(u, { role: e.target.value }, 'Rol actualizado')}
                        className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </TableCell>
                    <TableCell className="text-xs">{u.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'success' : 'outline'}>{u.isActive ? 'activo' : 'desactivado'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-ES') : 'nunca'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado || soyYo}
                          title={soyYo ? 'No puedes desactivar tu propio usuario' : undefined}
                          onClick={() => patch(u, { is_active: !u.isActive }, u.isActive ? 'Usuario desactivado' : 'Usuario activado')}
                        >
                          {u.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setResetFor(resetFor === u.userId ? null : u.userId)}>
                          Contraseña
                        </Button>
                      </div>
                      {resetFor === u.userId && (
                        <ResetPasswordForm
                          userId={u.userId}
                          nombre={u.fullName}
                          onDone={() => setResetFor(null)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {meta && (
            <PaginationBar page={meta.page} totalPages={meta.totalPages} total={meta.total} label="usuarios" onPage={setPage} />
          )}
        </CardContent>
      </Card>

      <NewUserForm onCreated={() => { setPage(1); mutate(); }} />
    </div>
  );
}

function ResetPasswordForm({ userId, nombre, onDone }: { userId: number; nombre: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = passwordPolicyErrors(password).length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/api/users/${userId}`, { password });
      toast.success(`Contraseña de ${nombre} actualizada`, {
        description: 'Avísale por un canal seguro; su sesión anterior sigue válida hasta que caduque.',
      });
      onDone();
    } catch (err: any) {
      toast.error('No se pudo cambiar la contraseña', { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-1 rounded border p-2">
      <Input
        aria-label={`Nueva contraseña de ${nombre}`}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nueva contraseña"
        className="h-8"
      />
      <PasswordChecklist password={password} />
      <Button size="sm" type="submit" disabled={!ready || saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
    </form>
  );
}

function NewUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('technician');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const ready = /\S+@\S+\.\S+/.test(email) && fullName.trim().length >= 2 && passwordPolicyErrors(password).length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/users', {
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        phone: phone.trim() || undefined,
        password,
      });
      toast.success('Usuario creado');
      setEmail(''); setFullName(''); setPhone(''); setPassword(''); setRole('technician'); setOpen(false);
      onCreated();
    } catch (err: any) {
      toast.error('No se pudo crear el usuario', { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nuevo usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alta de usuario</DialogTitle>
          <DialogDescription>
            El rol determina la matriz de permisos. La contraseña inicial debe cumplir la política de
            seguridad; avísala al usuario por un canal seguro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Nombre completo</span>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium">Rol</span>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger aria-label="Rol del nuevo usuario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium">Teléfono (opcional)</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">Contraseña inicial</span>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <PasswordChecklist password={password} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!ready || saving}>{saving ? 'Guardando…' : 'Crear usuario'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
