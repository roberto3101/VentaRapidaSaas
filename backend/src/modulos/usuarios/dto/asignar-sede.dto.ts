import { IsUUID, IsArray, ArrayMinSize } from 'class-validator';

export class AsignarSedeDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  sedesIds: string[];
}
