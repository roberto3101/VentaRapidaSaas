import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearTransferenciaDto } from './dto/crear-transferencia.dto';
import { CancelarTransferenciaDto } from './dto/cancelar-transferencia.dto';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';

@Injectable()
export class TransferenciasService {
  private readonly logger = new Logger(TransferenciasService.name);

  constructor(private readonly db: DatabaseService) {}

  async crear(dto: CrearTransferenciaDto, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;

    if (dto.sedeOrigenId === dto.sedeDestinoId) {
      throw new BadRequestException(
        'La sede origen y destino no pueden ser la misma',
      );
    }

    const tenant = await this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    for (const item of dto.items) {
      const stock = await this.db.inventoryStock.findUnique({
        where: {
          variantId_locationId: {
            variantId: item.varianteId,
            locationId: dto.sedeOrigenId,
          },
        },
      });
      if (
        !tenant.allowNegativeStock &&
        (stock?.availableQuantity ?? 0) < item.cantidad
      ) {
        throw new BadRequestException(
          `Stock insuficiente para variante ${item.varianteId}`,
        );
      }
    }

    const numeroTransferencia = await this.db.generarSecuencia(
      tenantId,
      'transfer',
      'TRF',
    );

    const transferencia = await this.db.transfer.create({
      data: {
        tenantId,
        transferNumber: numeroTransferencia,
        fromLocationId: dto.sedeOrigenId,
        toLocationId: dto.sedeDestinoId,
        notes: dto.notas,
        expectedAt: dto.fechaEsperada ? new Date(dto.fechaEsperada) : null,
        createdBy: usuario.sub,
      },
      include: { fromLocation: true, toLocation: true },
    });

    this.logger.log(
      `Transferencia ${numeroTransferencia} creada: ${dto.items.length} items`,
    );
    return transferencia;
  }

  async despachar(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const transferencia = await this.obtenerPorId(tenantId, id);
    if (transferencia.status !== 'pending') {
      throw new BadRequestException(
        `No se puede despachar una transferencia en estado ${transferencia.status}`,
      );
    }

    // Si no hay movimientos aún, crearlos desde los items
    const movimientosSalida = transferencia.inventoryMovements.filter(
      (m) => m.movementType === 'transfer_out',
    );
    if (movimientosSalida.length === 0) {
      // For now just update status - movements should be created when transfer is created with items
    }

    const result = await this.db.transfer.updateMany({
      where: { id, tenantId },
      data: { status: 'in_transit' },
    });
    if (result.count !== 1)
      throw new NotFoundException('Transferencia no encontrada');
    return this.obtenerPorId(tenantId, id);
  }

  async recibir(id: string, usuario: JwtPayload) {
    const tenantId = usuario.tenantId!;
    const transferencia = await this.obtenerPorId(tenantId, id);
    if (transferencia.status !== 'in_transit') {
      throw new BadRequestException(
        `No se puede recibir una transferencia en estado ${transferencia.status}`,
      );
    }

    const movimientosSalida = await this.db.inventoryMovement.findMany({
      where: { transferId: id, tenantId, movementType: 'transfer_out' },
    });

    for (const mov of movimientosSalida) {
      await this.db.inventoryMovement.create({
        data: {
          tenantId,
          locationId: transferencia.toLocationId,
          variantId: mov.variantId,
          movementType: 'transfer_in',
          quantity: mov.quantity,
          direction: 1,
          transferId: id,
          currencyCode: mov.currencyCode,
          createdBy: usuario.sub,
        },
      });
    }

    const result = await this.db.transfer.updateMany({
      where: { id, tenantId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedBy: usuario.sub,
      },
    });
    if (result.count !== 1)
      throw new NotFoundException('Transferencia no encontrada');
    return this.obtenerPorId(tenantId, id);
  }

  async cancelar(
    id: string,
    dto: CancelarTransferenciaDto,
    usuario: JwtPayload,
  ) {
    const tenantId = usuario.tenantId!;
    const transferencia = await this.obtenerPorId(tenantId, id);
    if (
      transferencia.status === 'completed' ||
      transferencia.status === 'cancelled'
    ) {
      throw new BadRequestException(
        `No se puede cancelar una transferencia ${transferencia.status}`,
      );
    }

    if (transferencia.status === 'in_transit') {
      const movimientos = await this.db.inventoryMovement.findMany({
        where: { transferId: id, tenantId, movementType: 'transfer_out' },
      });
      for (const mov of movimientos) {
        await this.db.inventoryMovement.create({
          data: {
            tenantId,
            locationId: mov.locationId,
            variantId: mov.variantId,
            movementType: 'transfer_out',
            quantity: mov.quantity,
            direction: 1,
            transferId: id,
            currencyCode: mov.currencyCode,
            createdBy: usuario.sub,
            isReversal: true,
            reversalOf: mov.id,
            notes: `Cancelación: ${dto.razon}`,
          },
        });
      }
    }

    const result = await this.db.transfer.updateMany({
      where: { id, tenantId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: usuario.sub,
        cancelReason: dto.razon,
      },
    });
    if (result.count !== 1)
      throw new NotFoundException('Transferencia no encontrada');
    return this.obtenerPorId(tenantId, id);
  }

  async obtenerTodas(tenantId: string, paginacion: PaginacionDto) {
    const where = { tenantId };
    const [datos, total] = await Promise.all([
      this.db.transfer.findMany({
        where,
        skip: paginacion.skip,
        take: paginacion.take,
        include: {
          fromLocation: true,
          toLocation: true,
          creator: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.transfer.count({ where }),
    ]);
    return RespuestaPaginada.crear(
      datos,
      total,
      paginacion.pagina,
      paginacion.limite,
    );
  }

  async obtenerPorId(tenantId: string, id: string) {
    const t = await this.db.transfer.findFirst({
      where: { id, tenantId },
      include: {
        fromLocation: true,
        toLocation: true,
        creator: { select: { fullName: true } },
        inventoryMovements: {
          include: { variant: { include: { product: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException('Transferencia no encontrada');
    return t;
  }
}
