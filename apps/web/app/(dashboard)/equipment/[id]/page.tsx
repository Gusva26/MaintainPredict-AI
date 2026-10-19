import { EquipmentDetail } from '@/components/equipment/EquipmentDetail';
import { equipmentExists, parseId } from '@/lib/db/detail-guard';

export const metadata = { title: 'Detalle de equipo' };

export default async function EquipmentDetailPage({ params }: { params: { id: string } }) {
  const id = parseId(params.id);
  await equipmentExists(id);
  return <EquipmentDetail id={id} />;
}
