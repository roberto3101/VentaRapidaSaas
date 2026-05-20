import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class EscanerService {
  constructor(private readonly db: DatabaseService) {}

  async buscarPorCodigoBarras(codigoBarras: string, sedeId: string) {
    if (typeof codigoBarras !== 'string' || codigoBarras.length === 0 || codigoBarras.length > 64) {
      throw new BadRequestException('Código de barras inválido');
    }
    if (!isUUID(sedeId, '4')) {
      throw new BadRequestException('sedeId no es un UUID v4 válido');
    }

    const resultado = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM v_stock_detail
      WHERE barcode = ${codigoBarras}
      AND location_id = ${sedeId}::uuid
      LIMIT 1
    `;

    if (!Array.isArray(resultado) || resultado.length === 0) {
      // Buscar si existe en alguna sede
      const variante = await this.db.productVariant.findFirst({
        where: { barcode: codigoBarras, deletedAt: null },
        include: { product: true },
      });

      if (!variante) throw new NotFoundException('Producto no encontrado con ese código de barras');

      return {
        encontrado: true,
        sinStockEnSede: true,
        variante,
        mensaje: 'Producto encontrado pero sin stock registrado en esta sede',
      };
    }

    return { encontrado: true, sinStockEnSede: false, stock: resultado[0] };
  }
}
