import { Controller, Post, Body } from '@nestjs/common';
import { EscanerService } from './escaner.service';
import { EscanearCodigoDto } from './dto/escanear-codigo.dto';

@Controller('inventario/escanear')
export class EscanerController {
  constructor(private readonly escanerService: EscanerService) {}

  @Post()
  escanear(@Body() dto: EscanearCodigoDto) {
    return this.escanerService.buscarPorCodigoBarras(dto.codigoBarras, dto.sedeId);
  }
}
