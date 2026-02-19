import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;

  @IsOptional()
  @IsString()
  ordenarPor?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccionOrden?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  busqueda?: string;

  get skip(): number {
    return (this.pagina - 1) * this.limite;
  }

  get take(): number {
    return this.limite;
  }
}
