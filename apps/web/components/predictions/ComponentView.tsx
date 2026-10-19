'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ComponentView({ component, explanation, features }: { component: string; explanation?: string | null; features?: Record<string, unknown> | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>Explicabilidad · {component}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{explanation ?? 'Sin explicación registrada para esta predicción.'}</p>
        {features && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Ver features</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(features, null, 2)}</pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
