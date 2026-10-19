import { Info } from 'lucide-react';

export type ExplanationFooterProps = {
  what: string;
  how: string;
  decision: string;
  className?: string;
};

export function ExplanationFooter({ what, how, decision, className }: ExplanationFooterProps) {
  return (
    <div
      className={`mt-3 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground ${className ?? ''}`}
      role="note"
      aria-label="Explicación del dato mostrado"
    >
      <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>Cómo interpretar este dato</span>
      </div>
      <ul className="space-y-0.5">
        <li><span className="font-medium">Qué muestra:</span> {what}</li>
        <li><span className="font-medium">Cómo interpretarlo:</span> {how}</li>
        <li><span className="font-medium">Qué decisión sugiere:</span> {decision}</li>
      </ul>
    </div>
  );
}
