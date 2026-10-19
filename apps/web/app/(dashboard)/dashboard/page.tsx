import { KPICards } from '@/components/dashboard/KPICards';
import { FailureChart } from '@/components/dashboard/FailureChart';
import { EquipmentGrid } from '@/components/dashboard/EquipmentGrid';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <KPICards />
      <div className="grid gap-6 lg:grid-cols-2">
        <FailureChart />
        <EquipmentGrid />
      </div>
      <ExplanationFooter
        what="KPIs operativos (paradas evitadas, costos, precisión), distribución de fallas por criticidad y estado de equipos."
        how="Compara los valores actuales con los objetivos del proyecto: paradas −60%, costos −30%, precisión 85%."
        decision="Priorizar intervenciones en equipos críticos y revisar falsos positivos si la precisión cae por debajo del objetivo."
      />
    </div>
  );
}
