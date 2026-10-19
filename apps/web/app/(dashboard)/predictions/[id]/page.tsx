import { PredictionDetail } from '@/components/predictions/PredictionDetail';
import { parseId, predictionExists } from '@/lib/db/detail-guard';

export const metadata = { title: 'Detalle de predicción' };

export default async function PredictionDetailPage({ params }: { params: { id: string } }) {
  const id = parseId(params.id);
  await predictionExists(id);
  return <PredictionDetail id={id} />;
}
