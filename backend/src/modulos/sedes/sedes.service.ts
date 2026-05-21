import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearSedeDto } from './dto/crear-sede.dto';
import { ActualizarSedeDto } from './dto/actualizar-sede.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';

@Injectable()
export class SedesService {
  constructor(private readonly db: DatabaseService) {}

  async crear(tenantId: string, dto: CrearSedeDto) {
    const tenant = await this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const sedesActuales = await this.db.location.count({
      where: { tenantId, deletedAt: null },
    });

    if (sedesActuales >= (tenant.maxLocations ?? 3)) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${tenant.maxLocations} sedes de tu plan`,
      );
    }

    return this.db.location.create({
      data: {
        tenantId,
        name: dto.nombre,
        code: dto.codigo,
        address: dto.direccion,
        city: dto.ciudad,
        stateProvince: dto.estadoProvincia,
        countryCode: dto.codigoPais,
        phone: dto.telefono,
        email: dto.email,
        taxName: dto.nombreImpuesto,
        taxRate: dto.tasaImpuesto,
        sortOrder: dto.ordenamiento,
      },
    });
  }

  async obtenerTodas(tenantId: string, paginacion: PaginacionDto) {
    const where = { tenantId, deletedAt: null };
    const [datos, total] = await Promise.all([
      this.db.location.findMany({
        where,
        skip: paginacion.skip,
        take: paginacion.take,
        orderBy: { sortOrder: 'asc' },
      }),
      this.db.location.count({ where }),
    ]);
    return RespuestaPaginada.crear(
      datos,
      total,
      paginacion.pagina,
      paginacion.limite,
    );
  }

  async obtenerPorId(tenantId: string, id: string) {
    const sede = await this.db.location.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!sede) throw new NotFoundException('Sede no encontrada');
    return sede;
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarSedeDto) {
    const result = await this.db.location.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        name: dto.nombre,
        code: dto.codigo,
        address: dto.direccion,
        city: dto.ciudad,
        phone: dto.telefono,
        email: dto.email,
        taxName: dto.nombreImpuesto,
        taxRate: dto.tasaImpuesto,
        sortOrder: dto.ordenamiento,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Sede no encontrada');
    return this.obtenerPorId(tenantId, id);
  }

  async eliminar(tenantId: string, id: string) {
    const result = await this.db.location.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (result.count !== 1) throw new NotFoundException('Sede no encontrada');
    return { id, deleted: true };
  }

  async obtenerResumen(tenantId: string) {
    return this.db.obtenerResumenSedes(tenantId);
  }
}
