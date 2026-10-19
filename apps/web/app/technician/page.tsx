import { OrderView } from '@/components/technician/OrderView';
import { ExplanationFooter } from '@/components/ExplanationFooter';
export const metadata = { title: 'App Técnico' };
export default function TechnicianHome() {
  return (
    <div className="space-y-4">
      <OrderView />
      <ExplanationFooter
        what="Órdenes asignadas al técnico autenticado con estado y detalles clave."
        how="Filtra por estado; toca una orden para ver repuestos, notas y completarla."
        decision="Ejecutar primero las prioridad=high/critical y con requires_hitl=true ya aprobadas."
      />
    </div>
  );
}
