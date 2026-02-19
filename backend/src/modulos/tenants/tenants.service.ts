import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearTenantDto } from './dto/crear-tenant.dto';
import { ActualizarTenantDto } from './dto/actualizar-tenant.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';
import { generarSlug } from '../../common/utils/slug.util';

@Injectable()
export class TenantsService {
  constructor(private readonly db: DatabaseService) {}

  async crear(dto: CrearTenantDto) {
    const slug = generarSlug(dto.nombre);
    const existente = await this.db.tenant.findUnique({ where: { slug } });
    if (existente) throw new ConflictException('Ya existe un tenant con ese nombre');

    return this.db.tenant.create({
      data: {
        name: dto.nombre, slug, logoUrl: dto.logoUrl, countryCode: dto.codigoPais,
        currencyCode: dto.codigoMoneda, currencySymbol: dto.simboloMoneda,
        timezone: dto.zonaHoraria, taxName: dto.nombreImpuesto, taxRate: dto.tasaImpuesto,
        taxIncluded: dto.impuestoIncluido, allowNegativeStock: dto.permitirStockNegativo,
      },
    });
  }

  async obtenerTodos(paginacion: PaginacionDto) {
    const where = { deletedAt: null };
    const [datos, total] = await Promise.all([
      this.db.tenant.findMany({ where, skip: paginacion.skip, take: paginacion.take, orderBy: { createdAt: 'desc' } }),
      this.db.tenant.count({ where }),
    ]);
    return RespuestaPaginada.crear(datos, total, paginacion.pagina, paginacion.limite);
  }

  async obtenerPorId(id: string) {
    const tenant = await this.db.tenant.findFirst({
      where: { id, deletedAt: null },
      include: { locations: { where: { deletedAt: null } } },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async actualizar(id: string, dto: ActualizarTenantDto) {
    await this.obtenerPorId(id);
    return this.db.tenant.update({
      where: { id },
      data: {
        name: dto.nombre, logoUrl: dto.logoUrl, taxName: dto.nombreImpuesto,
        taxRate: dto.tasaImpuesto, taxIncluded: dto.impuestoIncluido,
        allowNegativeStock: dto.permitirStockNegativo,
      },
    });
  }

  async eliminar(id: string) {
    await this.obtenerPorId(id);
    return this.db.tenant.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
