import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ReportesService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerResumenDashboard(tenantId: string, sedeId?: string) {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());

    const whereBase: any = { tenantId };
    if (sedeId) whereBase.locationId = sedeId;

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
      this.db.$queryRawUnsafe(`
        SELECT COUNT(*) as total FROM inventory_stock s
        JOIN product_variants pv ON pv.id = s.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE p.tenant_id = '${tenantId}'
        AND s.quantity <= COALESCE(pv.min_stock, 0)
        AND s.quantity > 0
        ${sedeId ? `AND s.location_id = '${sedeId}'::uuid` : ''}
      `),
      this.db.$queryRawUnsafe(`
        SELECT COUNT(*) as total FROM inventory_stock s
        JOIN product_variants pv ON pv.id = s.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE p.tenant_id = '${tenantId}'
        AND s.quantity <= 0
        ${sedeId ? `AND s.location_id = '${sedeId}'::uuid` : ''}
      `),
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
        stockBajo: Number((stockBajo as any)[0]?.total ?? 0),
        stockAgotado: Number((stockAgotado as any)[0]?.total ?? 0),
      },
      sedes: resumenSedes,
    };
  }

  async obtenerMovimientosPorTipo(tenantId: string, fechaInicio: string, fechaFin: string, sedeId?: string) {
    const whereBase = sedeId ? `AND location_id = '${sedeId}'::uuid` : '';

    return this.db.$queryRawUnsafe(`
      SELECT
        movement_type,
        COUNT(*) as cantidad,
        SUM(quantity) as unidades_totales,
        COALESCE(SUM(total), 0) as monto_total,
        currency_code
      FROM inventory_movements
      WHERE tenant_id = '${tenantId}'
      AND created_at >= '${fechaInicio}'::timestamptz
      AND created_at <= '${fechaFin}'::timestamptz
      ${whereBase}
      GROUP BY movement_type, currency_code
      ORDER BY cantidad DESC
    `);
  }

  async obtenerTopProductos(tenantId: string, sedeId?: string, limite: number = 10) {
    const whereBase = sedeId ? `AND m.location_id = '${sedeId}'::uuid` : '';

    return this.db.$queryRawUnsafe(`
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
      WHERE m.tenant_id = '${tenantId}'
      AND m.created_at >= NOW() - INTERVAL '30 days'
      ${whereBase}
      GROUP BY p.name, pv.sku, pv.variant_name
      ORDER BY unidades_vendidas DESC
      LIMIT ${limite}
    `);
  }

  async obtenerMovimientosDiarios(tenantId: string, dias: number = 30, sedeId?: string) {
    const whereBase = sedeId ? `AND location_id = '${sedeId}'::uuid` : '';

    return this.db.$queryRawUnsafe(`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Lima') as fecha,
        COUNT(*) as total_movimientos,
        SUM(CASE WHEN direction = 1 THEN quantity ELSE 0 END) as entradas,
        SUM(CASE WHEN direction = -1 THEN quantity ELSE 0 END) as salidas,
        COALESCE(SUM(CASE WHEN direction = -1 THEN total ELSE 0 END), 0) as ventas_total
      FROM inventory_movements
      WHERE tenant_id = '${tenantId}'
      AND created_at >= NOW() - INTERVAL '${dias} days'
      ${whereBase}
      GROUP BY DATE(created_at AT TIME ZONE 'America/Lima')
      ORDER BY fecha DESC
    `);
  }

  async verificarIntegridadStock() {
    return this.db.verificarIntegridadStock();
  }

  async recalcularStock() {
    const actualizados = await this.db.recalcularTodoElStock();
    return { mensaje: `Stock recalculado: ${actualizados} variantes actualizadas` };
  }
}
