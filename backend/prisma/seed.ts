import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Crear tenant demo Perú
  const tenantPeru = await prisma.tenant.upsert({
    where: { slug: 'bodega-demo-peru' },
    update: {},
    create: {
      name: 'Bodega Demo Perú',
      slug: 'bodega-demo-peru',
      countryCode: 'PE',
      currencyCode: 'PEN',
      currencySymbol: 'S/',
      timezone: 'America/Lima',
      locale: 'es-PE',
      taxName: 'IGV',
      taxRate: 18.00,
      taxIncluded: true,
      lowStockThreshold: 10,
      maxLocations: 5,
      maxUsers: 20,
      maxProducts: 5000,
      plan: 'pro',
    },
  });

  console.log(`✅ Tenant creado: ${tenantPeru.name} (${tenantPeru.id})`);

  // 2. Crear sedes
  const sedeCentral = await prisma.location.create({
    data: {
      tenantId: tenantPeru.id,
      name: 'Sede Central Lima',
      code: 'LIMA-01',
      address: 'Av. Javier Prado 1234, San Isidro',
      city: 'Lima',
      stateProvince: 'Lima',
      countryCode: 'PE',
      phone: '+51 1 234 5678',
    },
  });

  const sedeBodega = await prisma.location.create({
    data: {
      tenantId: tenantPeru.id,
      name: 'Bodega Callao',
      code: 'CAL-01',
      address: 'Jr. Industrial 567, Callao',
      city: 'Callao',
      stateProvince: 'Callao',
      countryCode: 'PE',
      phone: '+51 1 987 6543',
    },
  });

  console.log(`✅ Sedes creadas: ${sedeCentral.name}, ${sedeBodega.name}`);

  // 3. Crear super admin
  const passwordHash = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@sistema.com',
      passwordHash,
      fullName: 'Super Administrador',
      role: 'super_admin',
      tenantId: null,
    },
  });

  // 4. Crear admin del tenant
  const tenantAdmin = await prisma.user.create({
    data: {
      email: 'admin@bodega-demo.com',
      passwordHash,
      fullName: 'Juan Pérez (Admin)',
      role: 'tenant_admin',
      tenantId: tenantPeru.id,
    },
  });

  // 5. Crear operador
  const operador = await prisma.user.create({
    data: {
      email: 'operador@bodega-demo.com',
      passwordHash,
      fullName: 'María García (Operador)',
      role: 'operator',
      tenantId: tenantPeru.id,
    },
  });

  // Asignar sedes a usuarios
  await prisma.userLocation.createMany({
    data: [
      { userId: tenantAdmin.id, locationId: sedeCentral.id, isDefault: true },
      { userId: tenantAdmin.id, locationId: sedeBodega.id },
      { userId: operador.id, locationId: sedeCentral.id, isDefault: true },
    ],
  });

  console.log(`✅ Usuarios creados: admin, tenant_admin, operador`);

  // 6. Crear categorías
  const catBebidas = await prisma.category.create({
    data: { tenantId: tenantPeru.id, name: 'Bebidas', slug: 'bebidas' },
  });
  const catAlimentos = await prisma.category.create({
    data: { tenantId: tenantPeru.id, name: 'Alimentos', slug: 'alimentos' },
  });
  const catLimpieza = await prisma.category.create({
    data: { tenantId: tenantPeru.id, name: 'Limpieza', slug: 'limpieza' },
  });

  console.log('✅ Categorías creadas');

  // 7. Crear productos con variantes
  const producto1 = await prisma.product.create({
    data: {
      tenantId: tenantPeru.id,
      name: 'Inca Kola',
      brand: 'Arca Continental Lindley',
      categoryId: catBebidas.id,
      hasVariants: true,
      tags: ['bebida', 'gaseosa', 'popular'],
      createdBy: tenantAdmin.id,
      variants: {
        create: [
          { sku: 'IK-500', barcode: '7750236002345', variantName: '500ml', purchasePrice: 1.50, salePrice: 2.50, minStock: 20, unit: 'und' },
          { sku: 'IK-1500', barcode: '7750236002352', variantName: '1.5L', purchasePrice: 3.00, salePrice: 5.00, minStock: 15, unit: 'und' },
          { sku: 'IK-3000', barcode: '7750236002369', variantName: '3L', purchasePrice: 5.00, salePrice: 8.50, minStock: 10, unit: 'und' },
        ],
      },
    },
    include: { variants: true },
  });

  const producto2 = await prisma.product.create({
    data: {
      tenantId: tenantPeru.id,
      name: 'Arroz Costeño',
      brand: 'Costeño',
      categoryId: catAlimentos.id,
      tags: ['arroz', 'granos', 'básico'],
      createdBy: tenantAdmin.id,
      variants: {
        create: [
          { sku: 'AC-1KG', barcode: '7751271000012', variantName: '1kg', purchasePrice: 3.80, salePrice: 5.50, minStock: 30, unit: 'kg' },
          { sku: 'AC-5KG', barcode: '7751271000029', variantName: '5kg', purchasePrice: 18.00, salePrice: 25.00, minStock: 10, unit: 'kg' },
        ],
      },
    },
    include: { variants: true },
  });

  console.log('✅ Productos creados con variantes');

  // 8. Crear contactos
  await prisma.contact.create({
    data: {
      tenantId: tenantPeru.id,
      type: 'supplier',
      name: 'Distribuidora Nacional SAC',
      companyName: 'Distribuidora Nacional SAC',
      documentType: 'RUC',
      documentNumber: '20123456789',
      phone: '+51 1 555 0001',
      email: 'ventas@distnacional.com',
      paymentTermsDays: 30,
    },
  });

  await prisma.contact.create({
    data: {
      tenantId: tenantPeru.id,
      type: 'customer',
      name: 'Tienda Don Pedro',
      documentType: 'RUC',
      documentNumber: '10987654321',
      phone: '+51 999 888 777',
    },
  });

  console.log('✅ Contactos creados');

  // 9. Crear movimientos iniciales de stock
  for (const variante of producto1.variants) {
    await prisma.inventoryMovement.create({
      data: {
        tenantId: tenantPeru.id,
        locationId: sedeCentral.id,
        variantId: variante.id,
        movementType: 'initial',
        quantity: 100,
        direction: 1,
        unitCost: Number(variante.purchasePrice),
        taxRate: 18,
        taxAmount: Number(variante.purchasePrice) * 100 * 0.18,
        subtotal: Number(variante.purchasePrice) * 100,
        total: Number(variante.purchasePrice) * 100 * 1.18,
        currencyCode: 'PEN',
        notes: 'Carga inicial de inventario',
        createdBy: tenantAdmin.id,
      },
    });
  }

  for (const variante of producto2.variants) {
    await prisma.inventoryMovement.create({
      data: {
        tenantId: tenantPeru.id,
        locationId: sedeCentral.id,
        variantId: variante.id,
        movementType: 'initial',
        quantity: 50,
        direction: 1,
        unitCost: Number(variante.purchasePrice),
        taxRate: 18,
        taxAmount: Number(variante.purchasePrice) * 50 * 0.18,
        subtotal: Number(variante.purchasePrice) * 50,
        total: Number(variante.purchasePrice) * 50 * 1.18,
        currencyCode: 'PEN',
        notes: 'Carga inicial de inventario',
        createdBy: tenantAdmin.id,
      },
    });
  }

  console.log('✅ Stock inicial cargado');
  console.log('');
  console.log('📋 CREDENCIALES DE PRUEBA:');
  console.log('   Super Admin:  admin@sistema.com / admin123');
  console.log('   Tenant Admin: admin@bodega-demo.com / admin123');
  console.log('   Operador:     operador@bodega-demo.com / admin123');
  console.log('');
  console.log('🎉 Seed completado exitosamente');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
