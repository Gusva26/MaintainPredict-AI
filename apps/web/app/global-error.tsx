'use client';
import { useEffect } from 'react';

/**
 * Último cortafuegos: sustituye al layout raíz, así que aquí NO hay Tailwind ni
 * componentes del sistema de diseño (no se ha cargado `globals.css`). Por eso se
 * usan estilos en línea a propósito.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error no controlado en el render:', error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: '40rem', margin: '0 auto', color: '#111' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Algo ha ido mal</h1>
        <p style={{ color: '#666', fontSize: '0.875rem' }}>
          La aplicación no ha podido renderizarse. Puedes reintentar o volver al panel.
        </p>
        <p style={{ color: '#999', fontSize: '0.75rem', wordBreak: 'break-word' }}>
          {error.message}
          {error.digest ? ` (referencia ${error.digest})` : ''}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button onClick={reset} style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '0.375rem', background: '#111', color: '#fff', cursor: 'pointer' }}>
            Reintentar
          </button>
          <a href="/dashboard" style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '0.375rem', color: '#111', textDecoration: 'none' }}>
            Volver al panel
          </a>
        </div>
        <p style={{ color: '#999', fontSize: '0.75rem', marginTop: '2rem' }}>
          Deberías poder volver a entrar, pero probablemente se ha perdido la sesión —{' '}
          <a href="/login" style={{ color: '#111' }}>inicia sesión de nuevo</a>.
        </p>
      </body>
    </html>
  );
}
