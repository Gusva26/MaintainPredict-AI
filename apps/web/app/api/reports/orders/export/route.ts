import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders, equipment, users } from '@/lib/db/schema';
import { requirePermissionOrInternal } from '@/lib/auth/session';
import { fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

const Filters = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  status: z.string().optional(),
  equipment_id: z.coerce.number().int().positive().optional(),
  technician_id: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermissionOrInternal(req, 'orders:read');
    const url = new URL(req.url);
    const f = Filters.parse(Object.fromEntries(url.searchParams));
    const format = (url.searchParams.get('format') ?? 'xlsx').toLowerCase();

    const start = f.start ? new Date(f.start) : new Date(Date.now() - 30 * 86400_000);
    const end = f.end ? new Date(f.end) : new Date();

    const rows = await db.select({
      order: maintenanceOrders,
      equipment: { equipmentId: equipment.equipmentId, name: equipment.name, criticality: equipment.criticality },
      technician: { userId: users.userId, fullName: users.fullName },
    })
      .from(maintenanceOrders)
      .leftJoin(equipment, eq(equipment.equipmentId, maintenanceOrders.equipmentId))
      .leftJoin(users, eq(users.userId, maintenanceOrders.technicianId))
      .where(and(
        gte(maintenanceOrders.createdAt, start),
        lt(maintenanceOrders.createdAt, end),
        f.status ? eq(maintenanceOrders.status, f.status) : undefined,
        f.equipment_id ? eq(maintenanceOrders.equipmentId, f.equipment_id) : undefined,
        f.technician_id ? eq(maintenanceOrders.technicianId, f.technician_id) : undefined,
      ))
      .orderBy(desc(maintenanceOrders.createdAt))
      .limit(5000);

    if (format !== 'xlsx') return fail(400, `Formato no soportado: ${format}. Usa xlsx`);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MaintainPredict AI';
    const ws = wb.addWorksheet('Órdenes');
    ws.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Equipo', key: 'eq', width: 28 },
      { header: 'Criticidad', key: 'cr', width: 14 },
      { header: 'Estado', key: 'st', width: 18 },
      { header: 'Prioridad', key: 'pr', width: 12 },
      { header: 'Programada', key: 'sc', width: 22 },
      { header: 'Técnico', key: 'tc', width: 22 },
      { header: 'Parada (h)', key: 'dh', width: 12 },
      { header: 'HITL', key: 'hitl', width: 8 },
      { header: 'Creada', key: 'cd', width: 22 },
      { header: 'Completada', key: 'cpt', width: 22 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    rows.forEach(({ order, equipment: eq_, technician }) => {
      ws.addRow({
        id: order.orderId,
        eq: eq_?.name ?? '',
        cr: eq_?.criticality ?? '',
        st: order.status,
        pr: order.priority,
        sc: order.scheduledDate ? new Date(order.scheduledDate).toLocaleString('es-ES') : '',
        tc: technician?.fullName ?? '',
        dh: order.estimatedDowntimeH ?? '',
        hitl: order.requiresHitl ? 'Sí' : 'No',
        cd: order.createdAt ? new Date(order.createdAt).toLocaleString('es-ES') : '',
        cpt: order.completedAt ? new Date(order.completedAt).toLocaleString('es-ES') : '',
      });
    });
    ws.autoFilter = { from: 'A1', to: 'K1' };

    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await logAudit({
      userId: session.sub === '0' ? null : Number(session.sub),
      action: 'read_report', module: 'reports',
      payload: { kind: 'orders_export', n: rows.length, format },
    });

    // El cuerpo es binario (XLSX), así que la explicación estándar viaja en
    // cabeceras: así el 100 % de los endpoints la ofrecen sin corromper el fichero.
    const explanation = {
      what: 'Exportación XLSX de órdenes de mantenimiento del periodo solicitado.',
      how: `${rows.length} órdenes entre ${start.toISOString().slice(0, 10)} y ${end.toISOString().slice(0, 10)}; incluye estado, prioridad, técnico, parada estimada y HITL.`,
      decision: 'Filtrar por criticidad para preparar el plan de paradas y detectar órdenes HITL sin aprobar.',
    };

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="maintainpredict-orders-${start.toISOString().slice(0,10)}_${end.toISOString().slice(0,10)}.xlsx"`,
        'content-length': String(buf.length),
        'x-explanation-what': explanation.what,
        'x-explanation-how': explanation.how,
        'x-explanation-decision': explanation.decision,
      },
    });
  } catch (e) { return handleError(e); }
}
