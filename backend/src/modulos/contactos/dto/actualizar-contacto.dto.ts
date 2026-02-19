import { PartialType } from '@nestjs/mapped-types';
import { CrearContactoDto } from './crear-contacto.dto';
export class ActualizarContactoDto extends PartialType(CrearContactoDto) {}
