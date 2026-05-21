import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearContactoDto } from './dto/crear-contacto.dto';
import { ActualizarContactoDto } from './dto/actualizar-contacto.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';

@Injectable()
export class ContactosService {
  constructor(private readonly db: DatabaseService) {}

  async crear(tenantId: string, dto: CrearContactoDto) {
    return this.db.contact.create({
      data: {
        tenantId,
        name: dto.nombre,
        type: dto.tipo as any,
        companyName: dto.nombreEmpresa,
        documentType: dto.tipoDocumento as any,
        documentNumber: dto.numeroDocumento,
        email: dto.email,
        phone: dto.telefono,
        address: dto.direccion,
        city: dto.ciudad,
        notes: dto.notas,
        creditLimit: dto.limiteCredito,
        paymentTermsDays: dto.diasPlazo,
      },
    });
  }

  async obtenerTodos(
    tenantId: string,
    paginacion: PaginacionDto,
    tipo?: string,
  ) {
    const where: any = { tenantId, deletedAt: null };
    if (tipo) where.type = tipo;
    if (paginacion.busqueda) {
      where.OR = [
        { name: { contains: paginacion.busqueda, mode: 'insensitive' } },
        { documentNumber: { contains: paginacion.busqueda } },
        { companyName: { contains: paginacion.busqueda, mode: 'insensitive' } },
      ];
    }
    const [datos, total] = await Promise.all([
      this.db.contact.findMany({
        where,
        skip: paginacion.skip,
        take: paginacion.take,
        orderBy: { name: 'asc' },
      }),
      this.db.contact.count({ where }),
    ]);
    return RespuestaPaginada.crear(
      datos,
      total,
      paginacion.pagina,
      paginacion.limite,
    );
  }

  async obtenerPorId(tenantId: string, id: string) {
    const contacto = await this.db.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!contacto) throw new NotFoundException('Contacto no encontrado');
    return contacto;
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarContactoDto) {
    const result = await this.db.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        name: dto.nombre,
        type: dto.tipo as any,
        companyName: dto.nombreEmpresa,
        documentType: dto.tipoDocumento as any,
        documentNumber: dto.numeroDocumento,
        email: dto.email,
        phone: dto.telefono,
        address: dto.direccion,
        city: dto.ciudad,
        notes: dto.notas,
        creditLimit: dto.limiteCredito,
        paymentTermsDays: dto.diasPlazo,
      },
    });
    if (result.count !== 1)
      throw new NotFoundException('Contacto no encontrado');
    return this.obtenerPorId(tenantId, id);
  }

  async eliminar(tenantId: string, id: string) {
    const result = await this.db.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1)
      throw new NotFoundException('Contacto no encontrado');
    return { id, deleted: true };
  }
}
