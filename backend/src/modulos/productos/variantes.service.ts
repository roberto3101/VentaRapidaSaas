import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearVarianteDto } from './dto/crear-variante.dto';
import { ActualizarVarianteDto } from './dto/actualizar-variante.dto';

@Injectable()
export class VariantesService {
  constructor(private readonly db: DatabaseService) {}

  async crear(productoId: string, dto: CrearVarianteDto) {
    return this.db.productVariant.create({
      data: {
        productId: productoId,
        sku: dto.sku,
        barcode: dto.codigoBarras,
        variantName: dto.nombreVariante,
        purchasePrice: dto.precioCompra ?? 0,
        salePrice: dto.precioVenta ?? 0,
        minStock: dto.stockMinimo ?? 0,
        maxStock: dto.stockMaximo,
        unit: dto.unidad ?? 'und',
        unitsPerBox: dto.unidadesPorCaja,
      },
    });
  }

  async actualizar(id: string, dto: ActualizarVarianteDto) {
    const variante = await this.db.productVariant.findFirst({ where: { id, deletedAt: null } });
    if (!variante) throw new NotFoundException('Variante no encontrada');
    return this.db.productVariant.update({
      where: { id },
      data: {
        sku: dto.sku, barcode: dto.codigoBarras, variantName: dto.nombreVariante,
        purchasePrice: dto.precioCompra, salePrice: dto.precioVenta,
        minStock: dto.stockMinimo, maxStock: dto.stockMaximo, unit: dto.unidad,
      },
    });
  }

  async eliminar(id: string) {
    return this.db.productVariant.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
