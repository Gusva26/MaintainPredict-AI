import { z } from 'zod';

/**
 * Política de contraseñas de MaintainPredict AI.
 *
 * Mínimo 10 caracteres con mayúscula, minúscula, dígito y símbolo, sin espacios.
 * Se aplica al alta de usuarios y al cambio de contraseña. La contraseña de demo
 * (`Password123!`) ya la cumple.
 */

export const PASSWORD_MIN_LENGTH = 10;
// bcrypt solo usa los primeros 72 bytes; recortar aquí evita sorpresas.
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordRule = { id: string; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'max-length', label: `Como máximo ${PASSWORD_MAX_LENGTH} caracteres`, test: (p) => p.length <= PASSWORD_MAX_LENGTH },
  { id: 'upper', label: 'Al menos una letra mayúscula', test: (p) => /[A-ZÁÉÍÓÚÜÑ]/.test(p) },
  { id: 'lower', label: 'Al menos una letra minúscula', test: (p) => /[a-záéíóúüñ]/.test(p) },
  { id: 'digit', label: 'Al menos un dígito', test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'Al menos un símbolo (no alfanumérico)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
  { id: 'no-space', label: 'Sin espacios en blanco', test: (p) => !/\s/.test(p) },
];

/** Devuelve los mensajes de las reglas incumplidas (vacío = contraseña válida). */
export function passwordPolicyErrors(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
}

/** Lanza un error 422 (lo traduce `handleError`) si la contraseña no cumple la política. */
export function assertPasswordPolicy(password: string): void {
  const errors = passwordPolicyErrors(password);
  if (errors.length > 0) {
    const err = new Error(`La contraseña no cumple la política de seguridad: ${errors.join('; ')}`);
    (err as any).status = 422;
    throw err;
  }
}

/** Esquema Zod reutilizable en los cuerpos de las peticiones. */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .superRefine((password, ctx) => {
    for (const message of passwordPolicyErrors(password)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
