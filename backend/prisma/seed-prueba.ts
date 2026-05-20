/**
 * Seed de prueba — DEV ONLY.
 *
 * Crea 3 tenants (2 Perú + 1 Venezuela) con 2 usuarios cada uno (admin + cajero).
 * Idempotente: re-correr no duplica registros, solo refresca password si cambia.
 *
 * Uso:
 *   pnpm prisma:seed:prueba
 *
 * NO ejecutar en producción. Las contraseñas son públicas y los emails son .test.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Test1234!';
const BCRYPT_COST = 12;

interface TenantPruebaConfig {
  slug: string;
  name: string;
  countryCode: 'PE' | 'VE';
  currencyCode: 'PEN' | 'VES';
  currencySymbol: string;
  locale: string;
  taxName: string;
  taxRate: number;
  usuarios: { email: string; fullName: string; role: UserRole }[];
}

const TENANTS: TenantPruebaConfig[] = [
  {
    slug: 'bodega-esquina',
    name: 'Bodega La Esquina',
    countryCode: 'PE',
    currencyCode: 'PEN',
    currencySymbol: 'S/',
    locale: 'es-PE',
    taxName: 'IGV',
    taxRate: 18,
    usuarios: [
      { email: 'admin@bodega-esquina.test', fullName: 'Roberto Admin', role: UserRole.tenant_admin },
      { email: 'cajero@bodega-esquina.test', fullName: 'María Cajera', role: UserRole.operator },
    ],
  },
  {
    slug: 'minimarket-centro',
    name: 'Minimarket El Centro',
    countryCode: 'PE',
    currencyCode: 'PEN',
    currencySymbol: 'S/',
    locale: 'es-PE',
    taxName: 'IGV',
    taxRate: 18,
    usuarios: [
      { email: 'admin@minimarket-centro.test', fullName: 'Carlos Admin', role: UserRole.tenant_admin },
      { email: 'cajero@minimarket-centro.test', fullName: 'Lucía Cajera', role: UserRole.operator },
    ],
  },
  {
    slug: 'mayorista-sur',
    name: 'Distribuidora Sur (Venezuela)',
    countryCode: 'VE',
    currencyCode: 'VES',
    currencySymbol: 'Bs',
    locale: 'es-VE',
    taxName: 'IVA',
    taxRate: 16,
    usuarios: [
      { email: 'admin@mayorista-sur.test', fullName: 'José Admin', role: UserRole.tenant_admin },
      { email: 'cajero@mayorista-sur.test', fullName: 'Ana Cajera', role: UserRole.operator },
    ],
  },
];

async function main() {
  console.log('Seeding test tenants + users...');
  console.log('Password for all accounts: ' + PASSWORD);
  console.log('');

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);

  for (const config of TENANTS) {
    // 1. Upsert tenant por slug (sí es unique)
    const tenant = await prisma.tenant.upsert({
      where: { slug: config.slug },
      update: {
        name: config.name,
        countryCode: config.countryCode,
        currencyCode: config.currencyCode,
        currencySymbol: config.currencySymbol,
        locale: config.locale,
        taxName: config.taxName,
        taxRate: config.taxRate,
        isActive: true,
      },
      create: {
        slug: config.slug,
        name: config.name,
        countryCode: config.countryCode,
        currencyCode: config.currencyCode,
        currencySymbol: config.currencySymbol,
        locale: config.locale,
        taxName: config.taxName,
        taxRate: config.taxRate,
      },
    });

    console.log(`Tenant: ${tenant.name}`);
    console.log(`  id:   ${tenant.id}`);
    console.log(`  pais: ${tenant.countryCode} (${tenant.currencyCode})`);

    // 2. Sucursal principal (Location) — los users necesitan una para login completo
    const existingLocation = await prisma.location.findFirst({
      where: { tenantId: tenant.id, name: 'Sucursal Principal' },
    });
    const location =
      existingLocation ??
      (await prisma.location.create({
        data: {
          tenantId: tenant.id,
          name: 'Sucursal Principal',
          code: 'PRINCIPAL',
          countryCode: tenant.countryCode,
          taxName: tenant.taxName,
          taxRate: tenant.taxRate,
          isActive: true,
        },
      }));

    // 3. Upsert usuarios + asignación a Location
    for (const userConfig of config.usuarios) {
      const existing = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: userConfig.email },
      });

      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              fullName: userConfig.fullName,
              role: userConfig.role,
              isActive: true,
              failedAttempts: 0,
              lockedUntil: null,
            },
          })
        : await prisma.user.create({
            data: {
              tenantId: tenant.id,
              email: userConfig.email,
              passwordHash,
              fullName: userConfig.fullName,
              role: userConfig.role,
              preferredLocationId: location.id,
            },
          });

      // Asignar a sucursal si no está ya
      const existingUL = await prisma.userLocation.findUnique({
        where: { userId_locationId: { userId: user.id, locationId: location.id } },
      });
      if (!existingUL) {
        await prisma.userLocation.create({
          data: { userId: user.id, locationId: location.id, isDefault: true },
        });
      }

      console.log(`  ${userConfig.role.padEnd(13)} ${userConfig.email}`);
    }
    console.log('');
  }

  console.log('Done. Login en http://localhost:3001/login con cualquiera de las cuentas.');
  console.log('Contrasena: ' + PASSWORD);
}

main()
  .catch((e) => {
    console.error('Seed FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
