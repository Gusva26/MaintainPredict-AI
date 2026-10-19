import { OrderView } from '@/components/technician/OrderView';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Checklists' };

export default function ChecklistsPage() {
  return (
    <div className="space-y-4">
      <OrderView onlyPending />
      <ExplanationFooter
        what="Tus órdenes que siguen abiertas, con el checklist de ejecución al desplegarlas."
        how="El checklist tiene 6 pasos (bloqueo y etiquetado, inspección, vibración, temperatura, lubricación y repuestos); el botón se activa solo al completarlos todos."
        decision="Completar la orden en cuanto el checklist esté al 100 % y adjuntar la foto del trabajo realizado."
      />
    </div>
  );
}
