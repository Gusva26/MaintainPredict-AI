import { OrderList } from '@/components/orders/OrderList';
import { ExplanationFooter } from '@/components/ExplanationFooter';
export const metadata = { title: 'Órdenes' };
export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <OrderList />
      <ExplanationFooter
        what="Órdenes de mantenimiento con estado, prioridad y técnico asignado."
        how="status=pending_approval requiere HITL (parada > 4h)."
        decision="Aprobar/rechazar las pendientes y cerrar las ejecutadas desde la app técnica."
      />
    </div>
  );
}
