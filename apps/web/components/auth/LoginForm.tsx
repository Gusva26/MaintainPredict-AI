'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  // El `next` lo construye el middleware, pero llega por la URL y cualquiera puede
  // escribirla: solo se acepta una ruta interna («/algo?x=1»). Sin esta comprobación,
  // un enlace de login manipulado (`/login?next=https://sitio-falso`) convertiría el
  // formulario en un redirector abierto y serviría para phishing.
  const raw = search.get('next') ?? '';
  const next = /^\/(?!\/)/.test(raw) && !raw.includes('\\') ? raw : '/dashboard';
  const [email, setEmail] = useState('admin@mp.ai');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error ?? 'Credenciales inválidas');
      }
      const { data } = await res.json();
      const dest = data?.user?.role === 'technician' ? '/technician' : next;
      router.push(dest);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Error');
    } finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Accede con tu cuenta corporativa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Accediendo…' : 'Acceder'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Demo: <code>admin@mp.ai</code> / <code>Password123!</code>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
