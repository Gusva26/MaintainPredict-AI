'use client';
import { PASSWORD_RULES } from '@/lib/auth/password-policy';
import { cn } from '@/lib/utils';

/**
 * Lista viva de las reglas de contraseña.
 *
 * Usa `PASSWORD_RULES` de `lib/auth/password-policy.ts`, la **misma** fuente que
 * valida el servidor: si la política cambia, la UI cambia sola y no puede prometer
 * algo distinto de lo que la API va a aceptar.
 */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="space-y-0.5 text-xs" aria-label="Requisitos de la contraseña">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={cn('flex items-center gap-1', ok ? 'text-emerald-600' : 'text-muted-foreground')}>
            <span aria-hidden>{ok ? '✓' : '·'}</span>
            <span>
              {rule.label}
              <span className="sr-only">{ok ? ' (cumplido)' : ' (pendiente)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
