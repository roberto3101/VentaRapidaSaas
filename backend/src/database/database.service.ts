import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conexión a PostgreSQL establecida');

    // Log de queries lentas en desarrollo
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > 500) {
          this.logger.warn(`Query lenta (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Conexión a PostgreSQL cerrada');
  }

  // ─── CONTEXTO MULTI-TENANT (Activa RLS) ─────────────────────────

  async establecerTenantActual(tenantId: string): Promise<void> {
    await this.$executeRawUnsafe(`SET app.current_tenant_id = '${tenantId}'`);
  }

  async limpiarTenantActual(): Promise<void> {
    await this.$executeRawUnsafe(`RESET app.current_tenant_id`);
  }

  // ─── TRANSACCIONES CON TENANT ────────────────────────────────────

  async transaccionConTenant<T>(
    tenantId: string,
    operacion: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.current_tenant_id = '${tenantId}'`);
      return operacion(tx);
    });
  }

  // ─── FUNCIONES SQL DEL SCHEMA ────────────────────────────────────

  async obtenerPrecioEfectivo(
    variantId: string,
    locationId: string,
    tipo: 'sale' | 'purchase' = 'sale',
  ): Promise<number> {
    const resultado = await this.$queryRaw<[{ fn_get_effective_price: number }]>`
      SELECT fn_get_effective_price(
        ${variantId}::uuid,
        ${locationId}::uuid,
        ${tipo}::price_type
      )`;
    return Number(resultado[0]?.fn_get_effective_price ?? 0);
  }

  async obtenerTasaImpuestoEfectiva(
    tenantId: string,
    locationId: string,
  ): Promise<number> {
    const resultado = await this.$queryRaw<[{ fn_get_effective_tax_rate: number }]>`
      SELECT fn_get_effective_tax_rate(
        ${tenantId}::uuid,
        ${locationId}::uuid
      )`;
    return Number(resultado[0]?.fn_get_effective_tax_rate ?? 0);
  }

  async generarSecuencia(
    tenantId: string,
    tipo: string,
    prefijo: string = 'TRF',
  ): Promise<string> {
    const resultado = await this.$queryRaw<[{ fn_next_sequence: string }]>`
      SELECT fn_next_sequence(
        ${tenantId}::uuid,
        ${tipo}::varchar,
        ${prefijo}::varchar
      )`;
    return resultado[0].fn_next_sequence;
  }

  async verificarIntegridadStock(): Promise<any[]> {
    return this.$queryRaw`SELECT * FROM fn_verify_stock_integrity()`;
  }

  async recalcularTodoElStock(): Promise<number> {
    const resultado = await this.$queryRaw<[{ variants_updated: bigint }]>`
      SELECT * FROM fn_recalculate_all_stock()`;
    return Number(resultado[0].variants_updated);
  }

  // ─── VISTAS SQL ──────────────────────────────────────────────────

  async obtenerStockDetallado(filtros: {
    tenantId: string;
    locationId?: string;
    soloStockBajo?: boolean;
    soloAgotados?: boolean;
    busqueda?: string;
    limite?: number;
    offset?: number;
  }) {
    const condiciones: string[] = [`tenant_id = '${filtros.tenantId}'`];

    if (filtros.locationId) {
      condiciones.push(`location_id = '${filtros.locationId}'`);
    }
    if (filtros.soloStockBajo) {
      condiciones.push(`is_low_stock = TRUE`);
    }
    if (filtros.soloAgotados) {
      condiciones.push(`is_out_of_stock = TRUE`);
    }
    if (filtros.busqueda) {
      condiciones.push(`(product_name ILIKE '%${filtros.busqueda}%' OR sku ILIKE '%${filtros.busqueda}%' OR barcode = '${filtros.busqueda}')`);
    }

    const where = condiciones.join(' AND ');
    const limite = filtros.limite ?? 50;
    const offset = filtros.offset ?? 0;

    return this.$queryRawUnsafe(
      `SELECT * FROM v_stock_detail WHERE ${where} ORDER BY product_name ASC LIMIT ${limite} OFFSET ${offset}`,
    );
  }

  async obtenerResumenSedes(tenantId: string) {
    return this.$queryRaw`
      SELECT * FROM v_location_summary WHERE tenant_id = ${tenantId}::uuid
    `;
  }

  async obtenerMovimientosRecientes(filtros: {
    tenantId: string;
    locationId?: string;
    tipo?: string;
    limite?: number;
    offset?: number;
  }) {
    const condiciones: string[] = [`tenant_id = '${filtros.tenantId}'`];

    if (filtros.locationId) {
      condiciones.push(`location_id = '${filtros.locationId}'`);
    }
    if (filtros.tipo) {
      condiciones.push(`movement_type = '${filtros.tipo}'`);
    }

    const where = condiciones.join(' AND ');
    const limite = filtros.limite ?? 50;
    const offset = filtros.offset ?? 0;

    return this.$queryRawUnsafe(
      `SELECT * FROM v_recent_movements WHERE ${where} ORDER BY created_at DESC LIMIT ${limite} OFFSET ${offset}`,
    );
  }

  async obtenerStockTotal(tenantId: string) {
    return this.$queryRaw`
      SELECT * FROM v_stock_total WHERE tenant_id = ${tenantId}::uuid
    `;
  }
}
