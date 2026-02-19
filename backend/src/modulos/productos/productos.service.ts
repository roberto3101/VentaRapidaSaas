import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';

@Injectable()
export class ProductosService {
  constructor(private readonly db: DatabaseService) {}

  async crear(tenantId: string, dto: CrearProductoDto, creadoPor: string) {
    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const totalProductos = await this.db.product.count({ where: { tenantId, deletedAt: null } });
    if (totalProductos >= (tenant.maxProducts ?? 1000)) {
      throw new BadRequestException(`Límite de ${tenant.maxProducts} productos alcanzado`);
    }

    return this.db.product.create({
      data: {
        tenantId, name: dto.nombre, description: dto.descripcion, brand: dto.marca,
        categoryId: dto.categoriaId, imageUrl: dto.imagenUrl,
        hasVariants: dto.tieneVariantes ?? false, tags: dto.etiquetas ?? [],
        createdBy: creadoPor,
        variants: {
          create: dto.variantes?.length
            ? dto.variantes.map((v) => ({
                sku: v.sku, barcode: v.codigoBarras, variantName: v.nombreVariante,
                purchasePrice: v.precioCompra ?? 0, salePrice: v.precioVenta ?? 0,
                minStock: v.stockMinimo ?? 0, maxStock: v.stockMaximo, unit: v.unidad ?? 'und',
              }))
            : [{ sku: `${dto.nombre.substring(0, 3).toUpperCase()}-${Date.now().toString(36)}`, variantName: 'Default', unit: 'und' }],
        },
      },
      include: { variants: true, category: true },
    });
  }

  async obtenerTodos(tenantId: string, paginacion: PaginacionDto) {
    const where: any = { tenantId, deletedAt: null };
    if (paginacion.busqueda) {
      where.OR = [
        { name: { contains: paginacion.busqueda, mode: 'insensitive' } },
        { brand: { contains: paginacion.busqueda, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: paginacion.busqueda, mode: 'insensitive' } } } },
        { variants: { some: { barcode: paginacion.busqueda } } },
      ];
    }
    const [datos, total] = await Promise.all([
      this.db.product.findMany({
        where, skip: paginacion.skip, take: paginacion.take,
        include: { variants: { where: { deletedAt: null } }, category: true, _count: { select: { variants: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.product.count({ where }),
    ]);
    return RespuestaPaginada.crear(datos, total, paginacion.pagina, paginacion.limite);
  }

  async obtenerPorId(tenantId: string, id: string) {
    const producto = await this.db.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          include: { variantAttributeValues: { include: { attributeType: true } }, locationPrices: true },
        },
        category: true,
      },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarProductoDto, actualizadoPor: string) {
    await this.obtenerPorId(tenantId, id);
    return this.db.product.update({
      where: { id },
      data: {
        name: dto.nombre, description: dto.descripcion, brand: dto.marca,
        categoryId: dto.categoriaId, imageUrl: dto.imagenUrl, tags: dto.etiquetas,
        updatedBy: actualizadoPor,
      },
      include: { variants: true, category: true },
    });
  }

  async eliminar(tenantId: string, id: string) {
    await this.obtenerPorId(tenantId, id);
    return this.db.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async buscarPorCodigoBarras(tenantId: string, codigoBarras: string) {
    const variante = await this.db.productVariant.findFirst({
      where: { barcode: codigoBarras, deletedAt: null, product: { tenantId, deletedAt: null } },
      include: { product: { include: { category: true } }, inventoryStock: true },
    });
    if (!variante) throw new NotFoundException('Producto no encontrado con ese código');
    return variante;
  }
}
