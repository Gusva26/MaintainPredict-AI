import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  PASSWORD_MAX_LENGTH,
  passwordPolicyErrors,
  assertPasswordPolicy,
  PasswordSchema,
} from '../lib/auth/password-policy';

describe('Política de contraseñas', () => {
  it('acepta la contraseña de demostración', () => {
    expect(passwordPolicyErrors('Password123!')).toEqual([]);
    expect(PasswordSchema.safeParse('Password123!').success).toBe(true);
  });

  it('exige la longitud mínima', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordPolicyErrors('Ab1!')).toContain(`Al menos ${PASSWORD_MIN_LENGTH} caracteres`);
    expect(passwordPolicyErrors('Abcdef123!').length).toBe(0);
  });

  it('exige mayúscula, minúscula, dígito y símbolo por separado', () => {
    expect(passwordPolicyErrors('password123!')).toContain('Al menos una letra mayúscula');
    expect(passwordPolicyErrors('PASSWORD123!')).toContain('Al menos una letra minúscula');
    expect(passwordPolicyErrors('PasswordAbc!')).toContain('Al menos un dígito');
    expect(passwordPolicyErrors('Password1234')).toContain('Al menos un símbolo (no alfanumérico)');
  });

  it('rechaza espacios en blanco', () => {
    expect(passwordPolicyErrors('Password 123!')).toContain('Sin espacios en blanco');
  });

  it('rechaza contraseñas más largas que el límite de bcrypt', () => {
    const tooLong = `Aa1!${'x'.repeat(PASSWORD_MAX_LENGTH)}`;
    expect(passwordPolicyErrors(tooLong)).toContain(`Como máximo ${PASSWORD_MAX_LENGTH} caracteres`);
  });

  it('assertPasswordPolicy lanza un error con status 422 y el detalle', () => {
    try {
      assertPasswordPolicy('corta');
      throw new Error('debería haber lanzado');
    } catch (err) {
      expect((err as any).status).toBe(422);
      expect((err as Error).message).toMatch(/política de seguridad/);
      expect((err as Error).message).toMatch(/10 caracteres/);
    }
  });

  it('cada regla declara id y etiqueta (para poder mostrarlas en la UI)', () => {
    for (const rule of PASSWORD_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.label).toBeTruthy();
      expect(typeof rule.test).toBe('function');
    }
  });
});
