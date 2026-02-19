import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { AsignarSedeDto } from './dto/asignar-sede.dto';
import { PaginacionDto } from '../../common/dto/paginacion.dto';
import { RespuestaPaginada } from '../../common/dto/respuesta-api.dto';
import { hashearContrasena } from '../../common/utils/hash.util';

const CAMPOS_SELECCION = {
  id: true, email: true, fullName: true, phone: true, role: true,
  avatarUrl: true, isActive: true, createdAt: true, lastLoginAt: true,
  userLocations: {
    select: {
      locationId: true, isDefault: true,
      location: { select: { id: true, name: true, code: true } },
    },
  },
} as const;

@Injectable()
export class UsuariosService {
  constructor(private readonly db: DatabaseService) {}

  async crear(tenantId: string, dto: CrearUsuarioDto, creadoPor: string) {
    const existente = await this.db.user.findFirst({
      where: { email: dto.email, tenantId, deletedAt: null },
    });
    if (existente) throw new ConflictException('Ya existe un usuario con este email');

    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const totalUsuarios = await this.db.user.count({ where: { tenantId, deletedAt: null } });
    if (totalUsuarios >= (tenant.maxUsers ?? 10)) {
      throw new BadRequestException(`Límite de ${tenant.maxUsers} usuarios alcanzado`);
    }

    return this.db.user.create({
      data: {
        tenantId, email: dto.email,
        passwordHash: await hashearContrasena(dto.contrasena),
        fullName: dto.nombreCompleto, phone: dto.telefono,
        role: (dto.rol as any) || 'operator', mustChangePassword: true,
      },
      select: CAMPOS_SELECCION,
    });
  }

  async obtenerTodos(tenantId: string, paginacion: PaginacionDto) {
    const where: any = { tenantId, deletedAt: null };
    if (paginacion.busqueda) {
      where.OR = [
        { fullName: { contains: paginacion.busqueda, mode: 'insensitive' as const } },
        { email: { contains: paginacion.busqueda, mode: 'insensitive' as const } },
      ];
    }
    const [datos, total] = await Promise.all([
      this.db.user.findMany({ where, skip: paginacion.skip, take: paginacion.take, select: CAMPOS_SELECCION, orderBy: { createdAt: 'desc' } }),
      this.db.user.count({ where }),
    ]);
    return RespuestaPaginada.crear(datos, total, paginacion.pagina, paginacion.limite);
  }

  async obtenerPorId(tenantId: string, id: string) {
    const usuario = await this.db.user.findFirst({ where: { id, tenantId, deletedAt: null }, select: CAMPOS_SELECCION });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarUsuarioDto) {
    await this.obtenerPorId(tenantId, id);
    return this.db.user.update({
      where: { id },
      data: { fullName: dto.nombreCompleto, phone: dto.telefono, role: dto.rol as any, isActive: dto.activo },
      select: CAMPOS_SELECCION,
    });
  }

  async asignarSedes(tenantId: string, userId: string, dto: AsignarSedeDto, asignadoPor: string) {
    await this.obtenerPorId(tenantId, userId);
    await this.db.userLocation.deleteMany({ where: { userId } });
    await this.db.userLocation.createMany({
      data: dto.sedesIds.map((sedeId, i) => ({
        userId, locationId: sedeId, isDefault: i === 0, assignedBy: asignadoPor,
      })),
    });
    return this.obtenerPorId(tenantId, userId);
  }

  async eliminar(tenantId: string, id: string) {
    await this.obtenerPorId(tenantId, id);
    return this.db.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
