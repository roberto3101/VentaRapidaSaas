import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class ValidarUuidPipe implements PipeTransform {
  transform(valor: string): string {
    if (!isUUID(valor, '4')) {
      throw new BadRequestException(`"${valor}" no es un UUID válido`);
    }
    return valor;
  }
}
