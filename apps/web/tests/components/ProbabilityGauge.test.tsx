import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProbabilityGauge } from '@/components/predictions/ProbabilityGauge';

describe('ProbabilityGauge', () => {
  it('muestra el porcentaje redondeado', () => {
    render(<ProbabilityGauge value={0.78} />);
    expect(screen.getByText('78%')).toBeInTheDocument();
  });
});
