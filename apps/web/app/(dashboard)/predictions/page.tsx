import { PredictionList } from '@/components/predictions/PredictionList';
import { ExplanationFooter } from '@/components/ExplanationFooter';
export const metadata = { title: 'Predicciones' };
export default function PredictionsPage() {
  return (
    <div className="space-y-4">
      <PredictionList />
      <ExplanationFooter
        what="Predicciones de falla ordenadas por probabilidad descendente."
        how="alert=true cuando failure_probability > 0.70 (regla 23.1)."
        decision="Lanzar auto-plan para las alertas o revisar explicabilidad del modelo."
      />
    </div>
  );
}
