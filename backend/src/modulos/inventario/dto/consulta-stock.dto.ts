import { IsOptional, IsUUID, IsBoolean, IsString } from 'class-validator';
import { PaginacionDto } from '../../../common/dto/paginacion.dto';

export class ConsultaStockDto extends PaginacionDto {
  @IsOptional() @IsUUID('4') sedeId?: string;
  @IsOptional() @IsUUID('4') categoriaId?: string;
  @IsOptional() @IsBoolean() soloStockBajo?: boolean;
  @IsOptional() @IsBoolean() soloAgotados?: boolean;
}
