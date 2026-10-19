import { EquipmentList } from '@/components/equipment/EquipmentList';
import { ExplanationFooter } from '@/components/ExplanationFooter';
export const metadata = { title: 'Equipos' };
export default function EquipmentPage() {
  return (
    <div className="space-y-4">
      <EquipmentList />
      <ExplanationFooter
        what="Listado completo de equipos con criticidad, estado y coste de parada."
        how="La criticidad determina la prioridad de las órdenes generadas por el PlannerAgent."
        decision="Filtrar por criticality=critical para priorizar inspecciones y por status=down para actuar de inmediato."
      />
    </div>
  );
}
