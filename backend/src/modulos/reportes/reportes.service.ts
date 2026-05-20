import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { DatabaseService } from '../../database/database.service';

function assertUuid(value: string, label: string): void {
  if (typeof value !== 'string' || !isUUID(value, '4')) {
    throw new BadRequestException(`${label} no es un UUID v4 válido`);
  }
}

function assertIsoDate(value: string, label: string): Date {
  // Soporta ISO-8601 (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ssZ). Se convierte a Date para
  // dejar que Prisma vincule el parámetro como timestamptz.
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} debe ser una fecha ISO-8601`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} no es una fecha ISO-8601 válida`);
  }
  return parsed;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

@Injectable()
export class ReportesService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerResumenDashboard(tenantId: string, sedeId?: string) {
    assertUuid(tenantId, 'tenantId');
    if (sedeId) assertUuid(sedeId, 'sedeId');

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());

    const whereBase: any = { tenantId };
    if (sedeId) whereBase.locationId = sedeId;

    const filtroSede = sedeId
      ? Prisma.sql`AND s.location_id = ${sedeId}::uuid`
      : Prisma.empty;

    const [
      totalProductos,
      totalVariantes,
      totalSedes,
      totalUsuarios,
      movimientosHoy,
      movimientosSemana,
      movimientosMes,
      resumenSedes,
      stockBajo,
      stockAgotado,
    ] = await Promise.all([
      this.db.product.count({ where: { tenantId, deletedAt: null } }),
      this.db.productVariant.count({ where: { product: { tenantId }, deletedAt: null } }),
      this.db.location.count({ where: { tenantId, deletedAt: null } }),
      this.db.user.count({ where: { tenantId, deletedAt: null } }),
      this.db.inventoryMovement.count({
        where: { ...whereBase, createdAt: { gte: new Date(hoy.toDateString()) } },
      }),
      this.db.inventoryMovement.count({
        where: { ...whereBase, createdAt: { gte: inicioSemana } },
      }),
      this.db.inventoryMovement.count({
        where: { ...whereBase, createdAt: { gte: inicioMes } },
      }),
      this.db.obtenerResumenSedes(tenantId),
      this.db.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) as total FROM inventory_stock s
        JOIN product_variants pv ON pv.id = s.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE p.tenant_id = ${tenantId}::uuid
        AND s.quantity <= COALESCE(pv.min_stock, 0)
        AND s.quantity > 0
        ${filtroSede}
      `,
      this.db.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) as total FROM inventory_stock s
        JOIN product_variants pv ON pv.id = s.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE p.tenant_id = ${tenantId}::uuid
        AND s.quantity <= 0
        ${filtroSede}
      `,
    ]);

    return {
      resumen: {
        totalProductos,
        totalVariantes,
        totalSedes,
        totalUsuarios,
      },
      movimientos: {
        hoy: movimientosHoy,
        estaSemana: movimientosSemana,
        esteMes: movimientosMes,
      },
      alertas: {
        stockBajo: Number(stockBajo[0]?.total ?? 0),
        stockAgotado: Number(stockAgotado[0]?.total ?? 0),
      },
      sedes: resumenSedes,
    };
  }

  async obtenerMovimientosPorTipo(
    tenantId: string,
    fechaInicio: string,
    fechaFin: string,
    sedeId?: string,
  ) {
    assertUuid(tenantId, 'tenantId');
    if (sedeId) assertUuid(sedeId, 'sedeId');
    const inicio = assertIsoDate(fechaInicio, 'fechaInicio');
    const fin = assertIsoDate(fechaFin, 'fechaFin');

    const filtroSede = sedeId
      ? Prisma.sql`AND location_id = ${sedeId}::uuid`
      : Prisma.empty;

    return this.db.$queryRaw`
      SELECT
        movement_type,
        COUNT(*) as cantidad,
        SUM(quantity) as unidades_totales,
        COALESCE(SUM(total), 0) as monto_total,
        currency_code
      FROM inventory_movements
      WHERE tenant_id = ${tenantId}::uuid
      AND created_at >= ${inicio}
      AND created_at <= ${fin}
      ${filtroSede}
      GROUP BY movement_type, currency_code
      ORDER BY cantidad DESC
    `;
  }

  async obtenerTopProductos(tenantId: string, sedeId?: string, limite: number = 10) {
    assertUuid(tenantId, 'tenantId');
    if (sedeId) assertUuid(sedeId, 'sedeId');
    const limiteSeguro = clampInt(limite, 10, 1, 100);

    const filtroSede = sedeId
      ? Prisma.sql`AND m.location_id = ${sedeId}::uuid`
      : Prisma.empty;

    return this.db.$queryRaw`
      SELECT
        p.name as producto,
        pv.sku,
        pv.variant_name,
        SUM(CASE WHEN m.movement_type = 'sale' THEN m.quantity ELSE 0 END) as unidades_vendidas,
        SUM(CASE WHEN m.movement_type = 'sale' THEN m.total ELSE 0 END) as monto_vendido,
        SUM(CASE WHEN m.movement_type = 'purchase' THEN m.quantity ELSE 0 END) as unidades_compradas
      FROM inventory_movements m
      JOIN product_variants pv ON pv.id = m.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE m.tenant_id = ${tenantId}::uuid
      AND m.created_at >= NOW() - INTERVAL '30 days'
      ${filtroSede}
      GROUP BY p.name, pv.sku, pv.variant_name
      ORDER BY unidades_vendidas DESC
      LIMIT ${limiteSeguro}
    `;
  }

  async obtenerMovimientosDiarios(tenantId: string, dias: number = 30, sedeId?: string) {
    assertUuid(tenantId, 'tenantId');
    if (sedeId) assertUuid(sedeId, 'sedeId');
    const diasSeguros = clampInt(dias, 30, 1, 365);

    const filtroSede = sedeId
      ? Prisma.sql`AND location_id = ${sedeId}::uuid`
      : Prisma.empty;

    return this.db.$queryRaw`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Lima') as fecha,
        COUNT(*) as total_movimientos,
        SUM(CASE WHEN direction = 1 THEN quantity ELSE 0 END) as entradas,
        SUM(CASE WHEN direction = -1 THEN quantity ELSE 0 END) as salidas,
        COALESCE(SUM(CASE WHEN direction = -1 THEN total ELSE 0 END), 0) as ventas_total
      FROM inventory_movements
      WHERE tenant_id = ${tenantId}::uuid
      AND created_at >= NOW() - make_interval(days => ${diasSeguros}::int)
      ${filtroSede}
      GROUP BY DATE(created_at AT TIME ZONE 'America/Lima')
      ORDER BY fecha DESC
    `;
  }

  async verificarIntegridadStock() {
    return this.db.verificarIntegridadStock();
  }

  async recalcularStock() {
    const actualizados = await this.db.recalcularTodoElStock();
    return { mensaje: `Stock recalculado: ${actualizados} variantes actualizadas` };
  }
}
