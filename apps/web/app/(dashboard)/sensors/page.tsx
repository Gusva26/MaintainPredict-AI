import { SensorList } from '@/components/sensors/SensorList';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Sensores' };

export default function SensorsPage() {
  return (
    <div className="space-y-4">
      <SensorList />
      <ExplanationFooter
        what="Todos los sensores de telemetría con su equipo, su unidad y sus umbrales mínimo y máximo."
        how="Cada sensor declara entre qué valores debería moverse; las lecturas fuera de rango se guardan con calidad distinta de 'good'. Al desplegar una fila se ven sus últimas lecturas."
        decision="Revisar los sensores en estado inactive o maintenance: sus lecturas no alimentan al predictor, así que un equipo puede parecer sano por falta de datos."
      />
    </div>
  );
}
