import { PartialType } from '@nestjs/mapped-types';
import { CrearSedeDto } from './crear-sede.dto';

export class ActualizarSedeDto extends PartialType(CrearSedeDto) {}
