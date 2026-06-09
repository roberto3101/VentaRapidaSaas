import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AprobarDiferenciaDto {
  /**
   * true = aprueba el cierre con la diferencia tal como está (status → reconciled).
   * false = rechaza; queda pending_approval hasta que cajero recuente.
   */
  @IsBoolean()
  approve!: boolean;

  /** Justificación obligatoria si se aprueba (auditoría) o si se rechaza (motivo). */
  @IsString()
  @MinLength(3, { message: 'Notas mínimo 3 caracteres' })
  @MaxLength(500)
  notes!: string;
}
