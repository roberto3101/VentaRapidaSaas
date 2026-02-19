import { PartialType } from '@nestjs/mapped-types';
import { CrearTenantDto } from './crear-tenant.dto';

export class ActualizarTenantDto extends PartialType(CrearTenantDto) {}
