import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExplanationFooter } from '@/components/ExplanationFooter';

describe('ExplanationFooter', () => {
  it('muestra los tres bloques de explicabilidad', () => {
    render(<ExplanationFooter what="X" how="Y" decision="Z" />);
    expect(screen.getByText(/Qué muestra:/i)).toBeInTheDocument();
    expect(screen.getByText(/Cómo interpretarlo:/i)).toBeInTheDocument();
    expect(screen.getByText(/Qué decisión sugiere:/i)).toBeInTheDocument();
  });
});
