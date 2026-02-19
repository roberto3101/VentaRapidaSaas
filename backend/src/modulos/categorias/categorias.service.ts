import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';
import { generarSlug } from '../../common/utils/slug.util';

@Injectable()
export class CategoriasService {
  constructor(private readonly db: DatabaseService) {}

  async crear(tenantId: string, dto: CrearCategoriaDto) {
    return this.db.category.create({
      data: {
        tenantId,
        name: dto.nombre,
        description: dto.descripcion,
       parentId: dto.categoriaPadreId,
        slug: generarSlug(dto.nombre),
        sortOrder: dto.ordenamiento,
      },
    });
  }

  async obtenerArbol(tenantId: string) {
    const categorias = await this.db.category.findMany({
      where: { tenantId, deletedAt: null },
      include: { children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return categorias.filter((c) => !c.parentId);
  }

  async obtenerTodas(tenantId: string) {
    return this.db.category.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async obtenerPorId(tenantId: string, id: string) {
    const categoria = await this.db.category.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { children: true, products: { where: { deletedAt: null }, take: 10 } },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarCategoriaDto) {
    await this.obtenerPorId(tenantId, id);
    return this.db.category.update({
      where: { id },
      data: {
        name: dto.nombre,
        description: dto.descripcion,
        parentId: dto.categoriaPadreId,
        slug: dto.nombre ? generarSlug(dto.nombre) : undefined,
        sortOrder: dto.ordenamiento,
      },
    });
  }

  async eliminar(tenantId: string, id: string) {
    await this.obtenerPorId(tenantId, id);
    return this.db.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
