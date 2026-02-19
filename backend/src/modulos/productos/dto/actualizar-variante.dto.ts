import { PartialType } from '@nestjs/mapped-types';
import { CrearVarianteDto } from './crear-variante.dto';
export class ActualizarVarianteDto extends PartialType(CrearVarianteDto) {}
