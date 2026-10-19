import { OrderDetail } from '@/components/orders/OrderDetail';
import { orderExists, parseId } from '@/lib/db/detail-guard';

export const metadata = { title: 'Detalle de orden' };

export default async function OrderPage({ params }: { params: { id: string } }) {
  const id = parseId(params.id);
  await orderExists(id);
  return <OrderDetail id={id} />;
}
