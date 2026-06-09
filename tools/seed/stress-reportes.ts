/**
 * Seed de stress para reportes. Genera ~50k inventory_movements
 * (de los cuales ~10k son movement_type='sale') sobre el tenant
 * 'bodega-demo-peru' para auditar EXPLAIN ANALYZE de queries de reportes.
 *
 * Uso: pnpm tsx tools/seed/stress-reportes.ts
 *
 * Idempotente: si detecta marker 'stress-reportes', no vuelve a insertar.
 * Reset:  DELETE FROM inventory_movements WHERE notes = 'stress-reportes';
 */
import { PrismaClient } from '@prisma/client';

const SALES = 10_000;
const TOTAL = 50_000; // sales + purchases + adjustments
const MARKER = 'stress-reportes';

const db = new PrismaClient();

async function main() {
  const tenant = await db.tenant.findUnique({ where: { slug: 'bodega-demo-peru' } });
  if (!tenant) throw new Error('Falta tenant bodega-demo-peru. Corre prisma:seed primero.');

  const ya = await db.inventoryMovement.count({ where: { tenantId: tenant.id, notes: MARKER } });
  if (ya >= TOTAL) {
    console.log(`OK: ya hay ${ya} rows de stress en tenant ${tenant.id}. Skip.`);
    return;
  }

  const locations = await db.location.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
  const variants = await db.$queryRaw<Array<{ id: string }>>`
    SELECT pv.id FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.tenant_id = ${tenant.id}::uuid LIMIT 50`;
  const user = await db.user.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  if (!locations.length || !variants.length || !user) throw new Error('Faltan locations/variants/user del tenant.');

  const locIds = locations.map((l) => `'${l.id}'::uuid`).join(',');
  const varIds = variants.map((v) => `'${v.id}'::uuid`).join(',');

  console.log(`Insertando ${TOTAL} inventory_movements (${SALES} ventas) ...`);
  const t0 = Date.now();

  // Una sola query con generate_series; ~2-5s para 50k.
  // movement_type: primeros SALES como 'sale', resto reparte 'purchase'/'adjustment'.
  // created_at: distribuye en los ultimos 120 dias.
  await db.$executeRawUnsafe(`
    INSERT INTO inventory_movements
      (id, tenant_id, location_id, variant_id, movement_type, quantity, direction,
       unit_price, subtotal, total, currency_code, notes, created_at, created_by)
    SELECT
      gen_random_uuid(),
      '${tenant.id}'::uuid,
      (ARRAY[${locIds}])[1 + (i % ${locations.length})],
      (ARRAY[${varIds}])[1 + (i % ${variants.length})],
      (CASE WHEN i <= ${SALES} THEN 'sale'
            WHEN i % 3 = 0 THEN 'purchase'
            ELSE 'adjustment_in' END)::movement_type,
      1 + (i % 9),
      CASE WHEN i <= ${SALES} THEN -1 ELSE 1 END,
      (5 + (i % 95))::numeric(14,2),
      ((1 + (i % 9)) * (5 + (i % 95)))::numeric(14,2),
      ((1 + (i % 9)) * (5 + (i % 95)) * 1.18)::numeric(14,2),
      'PEN',
      '${MARKER}',
      NOW() - (random() * INTERVAL '120 days'),
      '${user.id}'::uuid
    FROM generate_series(1, ${TOTAL}) AS i;
  `);

  // ANALYZE para que el planner tenga estadisticas frescas antes del EXPLAIN ANALYZE.
  await db.$executeRawUnsafe(`ANALYZE inventory_movements;`);
  await db.$executeRawUnsafe(`ANALYZE product_variants;`);
  await db.$executeRawUnsafe(`ANALYZE products;`);

  console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s. Tenant ${tenant.id}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
