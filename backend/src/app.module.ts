import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

// Configuración
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

// Infraestructura
import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TenantContextoMiddleware } from './common/middleware/tenant-contexto.middleware';

// Módulos de negocio
import { AuthModule } from './modulos/auth/auth.module';
import { TenantsModule } from './modulos/tenants/tenants.module';
import { SedesModule } from './modulos/sedes/sedes.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { CategoriasModule } from './modulos/categorias/categorias.module';
import { ProductosModule } from './modulos/productos/productos.module';
import { PreciosModule } from './modulos/precios/precios.module';
import { ContactosModule } from './modulos/contactos/contactos.module';
import { InventarioModule } from './modulos/inventario/inventario.module';
import { TransferenciasModule } from './modulos/transferencias/transferencias.module';
import { ReportesModule } from './modulos/reportes/reportes.module';
import { HealthModule } from './modulos/health/health.module';
import { VentasModule } from './modulos/ventas/ventas.module';

@Module({
  imports: [
    // Configuración global
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Base de datos (Prisma)
    DatabaseModule,

    // Módulos de negocio
    AuthModule,
    TenantsModule,
    SedesModule,
    UsuariosModule,
    CategoriasModule,
    ProductosModule,
    PreciosModule,
    ContactosModule,
    InventarioModule,
    TransferenciasModule,
    ReportesModule,
    HealthModule,
    VentasModule,
  ],
  providers: [
    // Guards globales (orden importa)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextoMiddleware)
      .forRoutes('*');
  }
}
