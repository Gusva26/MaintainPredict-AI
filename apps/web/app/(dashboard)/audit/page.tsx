import { AuditTable } from '@/components/audit/AuditTable';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Auditoría' };

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <AuditTable />
      <ExplanationFooter
        what="Bitácora inmutable: quién hizo qué, en qué módulo, sobre qué entidad, desde qué IP y cuándo."
        how="Filtra por módulo, acción o rango de fechas. Un pico de login_failed o de create_order fuera de turno es la señal a mirar."
        decision="Ante anomalías (fallos de acceso repetidos, aprobaciones o cierres masivos), revisar el usuario implicado y revisar sus permisos."
      />
    </div>
  );
}
