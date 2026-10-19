import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/LoginForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('LoginForm', () => {
  it('renderiza campos y botón', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Acceder/i })).toBeInTheDocument();
  });

  it('permite escribir email', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const input = screen.getByLabelText(/Email/i);
    await user.clear(input);
    await user.type(input, 'supervisor@mp.ai');
    expect((input as HTMLInputElement).value).toBe('supervisor@mp.ai');
  });
});
