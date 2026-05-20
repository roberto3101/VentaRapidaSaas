import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';

function assertUuid(value: string, label: string): void {
  if (typeof value !== 'string' || !isUUID(value, '4')) {
    throw new BadRequestException(`${label} no es un UUID v4 válido`);
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

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
    assertUuid(tenantId, 'tenantId');
    // set_config acepta el valor como parámetro vinculado (no se interpola la cadena).
    await this.$queryRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  }

  async limpiarTenantActual(): Promise<void> {
    await this.$queryRaw`SELECT set_config('app.current_tenant_id', '', false)`;
  }

  // ─── TRANSACCIONES CON TENANT ────────────────────────────────────

  async transaccionConTenant<T>(
    tenantId: string,
    operacion: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    assertUuid(tenantId, 'tenantId');
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
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
    assertUuid(filtros.tenantId, 'tenantId');
    if (filtros.locationId) assertUuid(filtros.locationId, 'locationId');

    const condiciones: Prisma.Sql[] = [
      Prisma.sql`tenant_id = ${filtros.tenantId}::uuid`,
    ];

    if (filtros.locationId) {
      condiciones.push(Prisma.sql`location_id = ${filtros.locationId}::uuid`);
    }
    if (filtros.soloStockBajo) {
      condiciones.push(Prisma.sql`is_low_stock = TRUE`);
    }
    if (filtros.soloAgotados) {
      condiciones.push(Prisma.sql`is_out_of_stock = TRUE`);
    }
    if (filtros.busqueda) {
      const patron = `%${filtros.busqueda}%`;
      condiciones.push(
        Prisma.sql`(product_name ILIKE ${patron} OR sku ILIKE ${patron} OR barcode = ${filtros.busqueda})`,
      );
    }

    const where = Prisma.join(condiciones, ' AND ');
    const limite = clampInt(filtros.limite, 50, 1, 500);
    const offset = clampInt(filtros.offset, 0, 0, 1_000_000);

    return this.$queryRaw`
      SELECT * FROM v_stock_detail
      WHERE ${where}
      ORDER BY product_name ASC
      LIMIT ${limite}
      OFFSET ${offset}
    `;
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
    assertUuid(filtros.tenantId, 'tenantId');
    if (filtros.locationId) assertUuid(filtros.locationId, 'locationId');

    const condiciones: Prisma.Sql[] = [
      Prisma.sql`tenant_id = ${filtros.tenantId}::uuid`,
    ];

    if (filtros.locationId) {
      condiciones.push(Prisma.sql`location_id = ${filtros.locationId}::uuid`);
    }
    if (filtros.tipo) {
      condiciones.push(Prisma.sql`movement_type = ${filtros.tipo}`);
    }

    const where = Prisma.join(condiciones, ' AND ');
    const limite = clampInt(filtros.limite, 50, 1, 500);
    const offset = clampInt(filtros.offset, 0, 0, 1_000_000);

    return this.$queryRaw`
      SELECT * FROM v_recent_movements
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${limite}
      OFFSET ${offset}
    `;
  }

  async obtenerStockTotal(tenantId: string) {
    return this.$queryRaw`
      SELECT * FROM v_stock_total WHERE tenant_id = ${tenantId}::uuid
    `;
  }
}
