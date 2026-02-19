import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { EstablecerPrecioSedeDto } from './dto/establecer-precio-sede.dto';
import { EstablecerPromoDto } from './dto/establecer-promo.dto';

@Injectable()
export class PreciosService {
  constructor(private readonly db: DatabaseService) {}

  async establecerPrecioSede(dto: EstablecerPrecioSedeDto, actualizadoPor: string) {
    return this.db.locationPrice.upsert({
      where: {
        variantId_locationId_priceType: {
          variantId: dto.varianteId, locationId: dto.sedeId, priceType: dto.tipoPrecio as any,
        },
      },
      create: {
        variantId: dto.varianteId, locationId: dto.sedeId,
        priceType: dto.tipoPrecio as any, price: dto.precio, updatedBy: actualizadoPor,
      },
      update: { price: dto.precio, updatedBy: actualizadoPor },
    });
  }

  async establecerPromo(dto: EstablecerPromoDto, actualizadoPor: string) {
    return this.db.locationPrice.upsert({
      where: {
        variantId_locationId_priceType: {
          variantId: dto.varianteId, locationId: dto.sedeId, priceType: dto.tipoPrecio as any,
        },
      },
      create: {
        variantId: dto.varianteId, locationId: dto.sedeId, priceType: dto.tipoPrecio as any,
        price: 0, promoPrice: dto.precioPromo,
        promoStartsAt: new Date(dto.fechaInicio), promoEndsAt: dto.fechaFin ? new Date(dto.fechaFin) : null,
        updatedBy: actualizadoPor,
      },
      update: {
        promoPrice: dto.precioPromo,
        promoStartsAt: new Date(dto.fechaInicio), promoEndsAt: dto.fechaFin ? new Date(dto.fechaFin) : null,
        updatedBy: actualizadoPor,
      },
    });
  }

  async obtenerPrecioEfectivo(varianteId: string, sedeId: string, tipo: 'sale' | 'purchase' = 'sale') {
    return this.db.obtenerPrecioEfectivo(varianteId, sedeId, tipo);
  }

  async obtenerPreciosPorSede(sedeId: string) {
    return this.db.locationPrice.findMany({
      where: { locationId: sedeId },
      include: { variant: { include: { product: true } } },
    });
  }

  async eliminarPrecioSede(id: string) {
    return this.db.locationPrice.delete({ where: { id } });
  }
}
