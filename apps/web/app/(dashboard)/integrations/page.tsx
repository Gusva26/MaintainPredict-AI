import { IntegrationsView } from '@/components/integrations/IntegrationsView';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Integraciones' };

export default function IntegrationsPage() {
  return (
    <div className="space-y-4">
      <IntegrationsView />
      <ExplanationFooter
        what="El estado en vivo de los cuatro adaptadores externos: ERP, SCADA, SMS y Email, con el modo activo (mock o real) y su latencia."
        how="'Correcto' significa que el adaptador ha respondido; la latencia alta apunta a un sistema externo lento, no a la aplicación. El modo indica si se está hablando con el sistema real o con el mock de desarrollo."
        decision="Si alguno aparece 'con fallo' en modo real, revisar sus credenciales y el endpoint en el .env; en modo mock, comprobar que los contenedores mock-erp, mock-scada, mock-sms y mailhog están levantados."
      />
    </div>
  );
}
