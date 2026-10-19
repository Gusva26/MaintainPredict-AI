'use client';
import { cn } from '@/lib/utils';

export function ProbabilityGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value > 0.9 ? 'bg-destructive' : value > 0.7 ? 'bg-amber-500' : value > 0.4 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums">{pct}%</span>
    </div>
  );
}
