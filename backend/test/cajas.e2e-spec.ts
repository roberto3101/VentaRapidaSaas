/**
 * E2E — Módulo Cajas (ADR-009)
 *
 * Cubre los 7 endpoints + edge cases críticos:
 *   POST   /api/v1/cajas/abrir
 *   GET    /api/v1/cajas/activo
 *   POST   /api/v1/cajas/:id/cerrar
 *   POST   /api/v1/cajas/:id/movimiento
 *   POST   /api/v1/cajas/:id/aprobar
 *   GET    /api/v1/cajas
 *   GET    /api/v1/cajas/:id
 *
 * Requisitos:
 *   - BD corriendo: postgresql://postgres:sql@localhost:5432/inventario_db
 *   - Seed aplicado: pnpm tsx prisma/seed-prueba.ts
 *
 * Tenant fixture: 'bodega-esquina' (PE / PEN)
 *   Admin:   admin@bodega-esquina.test  (tenant_admin)
 *   Cajero:  cajero@bodega-esquina.test (operator)
 *   Cajero2: cajero@minimarket-centro.test (otro tenant — aislamiento)
 *   Password: Test1234!
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ExcepcionHttpFilter } from '../src/common/filtros/excepcion-http.filter';
import { TransformarInterceptor } from '../src/common/interceptores/transformar.interceptor';
import { OPCIONES_VALIDACION } from '../src/config/validacion.config';

const PREFIX = '/api/v1';
const PASSWORD = 'Test1234!';

const ADMIN_EMAIL = 'admin@bodega-esquina.test';
const CAJERO_EMAIL = 'cajero@bodega-esquina.test';
const CAJERO_OTRO_TENANT = 'cajero@minimarket-centro.test';

describe('CajasController (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaClient;

  let tokenAdmin: string;
  let tokenCajero: string;
  let tokenCajeroOtroTenant: string;
  let tenantId: string;
  let locationId: string;
  let cajeroUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe(OPCIONES_VALIDACION));
    app.useGlobalFilters(new ExcepcionHttpFilter());
    app.useGlobalInterceptors(new TransformarInterceptor());
    await app.init();
    server = app.getHttpServer();

    prisma = new PrismaClient();

    // Login admin + cajero + cajero otro tenant
    const loginAdmin = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: ADMIN_EMAIL, contrasena: PASSWORD });
    expect(loginAdmin.status).toBeLessThan(300);
    tokenAdmin = (loginAdmin.body.datos ?? loginAdmin.body).tokenAcceso;
    expect(tokenAdmin).toBeDefined();

    const loginCajero = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: CAJERO_EMAIL, contrasena: PASSWORD });
    expect(loginCajero.status).toBeLessThan(300);
    tokenCajero = (loginCajero.body.datos ?? loginCajero.body).tokenAcceso;
    expect(tokenCajero).toBeDefined();

    const loginOtro = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: CAJERO_OTRO_TENANT, contrasena: PASSWORD });
    expect(loginOtro.status).toBeLessThan(300);
    tokenCajeroOtroTenant = (loginOtro.body.datos ?? loginOtro.body).tokenAcceso;

    // Resolver tenantId + locationId + cajeroUserId desde BD
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'bodega-esquina' } });
    tenantId = tenant.id;
    const sede = await prisma.location.findFirstOrThrow({
      where: { tenantId, name: 'Sucursal Principal' },
    });
    locationId = sede.id;
    const cajero = await prisma.user.findFirstOrThrow({
      where: { tenantId, email: CAJERO_EMAIL },
    });
    cajeroUserId = cajero.id;
  });

  beforeEach(async () => {
    // Limpieza: borra cash_shifts del tenant test para empezar limpio
    await prisma.cashMovement.deleteMany({
      where: { cashShift: { tenantId } },
    });
    await prisma.cashShiftBalance.deleteMany({
      where: { cashShift: { tenantId } },
    });
    await prisma.cashShift.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await prisma.cashMovement.deleteMany({ where: { cashShift: { tenantId } } });
    await prisma.cashShiftBalance.deleteMany({ where: { cashShift: { tenantId } } });
    await prisma.cashShift.deleteMany({ where: { tenantId } });
    await prisma.$disconnect();
    await app.close();
  });

  // Maneja correctamente el caso donde body = {datos: null, ...}
  const unwrap = (res: request.Response) =>
    res.body && typeof res.body === 'object' && 'datos' in res.body
      ? res.body.datos
      : res.body;

  // ============================================================
  // POST /cajas/abrir
  // ============================================================
  describe('POST /cajas/abrir', () => {
    it('happy path — operator abre turno con monto inicial', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId,
          openingAmounts: [{ currencyCode: 'PEN', openingAmount: '150.00' }],
          notes: 'apertura test',
        });
      expect(res.status).toBeLessThan(300);
      const turno = unwrap(res);
      expect(turno.id).toBeDefined();
      expect(turno.status).toBe('open');
      expect(turno.userId).toBe(cajeroUserId);
      expect(turno.locationId).toBe(locationId);
      expect(turno.balances).toHaveLength(1);
      expect(turno.balances[0].currencyCode).toBe('PEN');
      expect(Number(turno.balances[0].openingAmount)).toBe(150);

      // Verifica que se creó el movimiento initial
      const movs = await prisma.cashMovement.findMany({ where: { cashShiftId: turno.id } });
      expect(movs).toHaveLength(1);
      expect(movs[0].reason).toBe('initial');
      expect(movs[0].type).toBe('in');
      expect(Number(movs[0].amount)).toBe(150);
    });

    it('happy path con apertura 0 — NO crea movimiento initial', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId,
          openingAmounts: [{ currencyCode: 'PEN', openingAmount: '0.00' }],
        });
      expect(res.status).toBeLessThan(300);
      const turno = unwrap(res);
      const movs = await prisma.cashMovement.findMany({ where: { cashShiftId: turno.id } });
      expect(movs).toHaveLength(0);
    });

    it('bloquea si el cajero ya tiene un turno abierto', async () => {
      // primero abre uno
      await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      // intenta abrir otro
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      expect(res.status).toBe(400);
      const body = res.body;
      expect(JSON.stringify(body)).toMatch(/ya tienes un turno abierto/i);
    });

    it('rechaza locationId que no existe', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId: '00000000-0000-4000-8000-000000000000',
          openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }],
        });
      expect(res.status).toBe(404);
    });

    it('rechaza locationId malformado (no UUID v4)', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId: 'no-es-uuid',
          openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }],
        });
      expect(res.status).toBe(400);
    });

    it('rechaza monto inicial negativo', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId,
          openingAmounts: [{ currencyCode: 'PEN', openingAmount: '-10.00' }],
        });
      // -10 falla IsNumberString({no_symbols:true}) que no admite el signo
      expect(res.status).toBe(400);
    });

    it('rechaza currencies duplicadas en apertura', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          locationId,
          openingAmounts: [
            { currencyCode: 'PEN', openingAmount: '50.00' },
            { currencyCode: 'PEN', openingAmount: '30.00' },
          ],
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/currency duplicada/i);
    });

    it('rechaza sin auth', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // GET /cajas/activo
  // ============================================================
  describe('GET /cajas/activo', () => {
    it('devuelve null si no hay turno', async () => {
      const res = await request(server)
        .get(`${PREFIX}/cajas/activo`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data).toBeNull();
    });

    it('devuelve el turno abierto del cajero', async () => {
      // abrir primero
      const abr = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '100.00' }] });
      const turnoAbierto = unwrap(abr);

      const res = await request(server)
        .get(`${PREFIX}/cajas/activo`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.id).toBe(turnoAbierto.id);
      expect(data.status).toBe('open');
    });

    it('aislamiento tenant — cajero de otro tenant no ve este turno', async () => {
      await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '100.00' }] });

      const res = await request(server)
        .get(`${PREFIX}/cajas/activo`)
        .set('Authorization', `Bearer ${tokenCajeroOtroTenant}`);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data).toBeNull();
    });
  });

  // ============================================================
  // POST /cajas/:id/cerrar
  // ============================================================
  describe('POST /cajas/:id/cerrar', () => {
    const abrirTurno = async (token: string, opening = '100.00') => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${token}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: opening }] });
      return unwrap(res);
    };

    it('cierre exacto — status reconciled, difference 0', async () => {
      const turno = await abrirTurno(tokenCajero, '100.00');
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '100.00' }] });
      expect(res.status).toBeLessThan(300);
      const cerrado = unwrap(res);
      expect(cerrado.status).toBe('reconciled');
      const bal = cerrado.balances[0];
      expect(Number(bal.expectedAmount)).toBe(100);
      expect(Number(bal.actualAmount)).toBe(100);
      expect(Number(bal.difference)).toBe(0);
    });

    it('cierre con diff ≤ S/5 (umbral default) — sigue reconciled', async () => {
      const turno = await abrirTurno(tokenCajero, '100.00');
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '103.50' }] });
      expect(res.status).toBeLessThan(300);
      const cerrado = unwrap(res);
      expect(cerrado.status).toBe('reconciled');
      expect(Number(cerrado.balances[0].difference)).toBeCloseTo(3.5);
    });

    it('cierre con diff > S/5 — pending_approval', async () => {
      const turno = await abrirTurno(tokenCajero, '100.00');
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '93.00' }] });
      expect(res.status).toBeLessThan(300);
      const cerrado = unwrap(res);
      expect(cerrado.status).toBe('pending_approval');
      expect(Number(cerrado.balances[0].difference)).toBeCloseTo(-7);
    });

    it('rechaza cerrar turno no propio (operator del mismo tenant)', async () => {
      // Para verdadero "operator distinto" en mismo tenant no tengo fixture aparte.
      // Probamos que el admin tampoco lo cierra (solo dueño y super_admin)
      const turno = await abrirTurno(tokenCajero, '100.00');
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '100.00' }] });
      expect(res.status).toBe(403);
    });

    it('rechaza cerrar 2 veces', async () => {
      const turno = await abrirTurno(tokenCajero, '50.00');
      await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '50.00' }] });

      const res2 = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '50.00' }] });
      expect(res2.status).toBe(400);
    });

    it('rechaza si falta una currency declarada en apertura', async () => {
      const turno = await abrirTurno(tokenCajero, '100.00');
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turno.id}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [] });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // POST /cajas/:id/movimiento
  // ============================================================
  describe('POST /cajas/:id/movimiento', () => {
    let turnoId: string;
    beforeEach(async () => {
      const abr = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '100.00' }] });
      turnoId = unwrap(abr).id;
    });

    it('cash_in válido por operator', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'in', reason: 'cash_in', amount: '20.00', currencyCode: 'PEN', notes: 'cambio' });
      expect(res.status).toBeLessThan(300);
      expect(unwrap(res).reason).toBe('cash_in');
    });

    it('rechaza reason=initial (la genera el sistema)', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'in', reason: 'initial', amount: '20.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/sistema/i);
    });

    it('rechaza reason=sale manual', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'in', reason: 'sale', amount: '20.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
    });

    it('rechaza adjustment por operator (requiere manager+)', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'in', reason: 'adjustment', amount: '5.00', currencyCode: 'PEN' });
      expect(res.status).toBe(403);
    });

    it('admin sí puede hacer adjustment', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ type: 'in', reason: 'adjustment', amount: '5.00', currencyCode: 'PEN' });
      expect(res.status).toBeLessThan(300);
    });

    it('rechaza amount cero o negativo', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'out', reason: 'cash_out', amount: '0.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
    });

    it('rechaza currency no declarada en el turno', async () => {
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/movimiento`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ type: 'in', reason: 'cash_in', amount: '10.00', currencyCode: 'USD' });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // POST /cajas/:id/aprobar
  // ============================================================
  describe('POST /cajas/:id/aprobar', () => {
    const setUpPendingApproval = async () => {
      // abre + cierra con diff grande para forzar pending_approval
      const abr = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '100.00' }] });
      const turnoId = unwrap(abr).id;
      const cer = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/cerrar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ actualAmounts: [{ currencyCode: 'PEN', actualAmount: '85.00' }] });
      expect(unwrap(cer).status).toBe('pending_approval');
      return turnoId;
    };

    it('admin aprueba — turno pasa a reconciled + crea ajuste', async () => {
      const turnoId = await setUpPendingApproval();
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/aprobar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ approve: true, notes: 'Faltó cambio chico, asumido' });
      expect(res.status).toBeLessThan(300);
      expect(unwrap(res).status).toBe('reconciled');

      const ajustes = await prisma.cashMovement.findMany({
        where: { cashShiftId: turnoId, reason: 'adjustment' },
      });
      expect(ajustes.length).toBeGreaterThan(0);
    });

    it('admin rechaza — turno vuelve a open, balances limpios', async () => {
      const turnoId = await setUpPendingApproval();
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/aprobar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ approve: false, notes: 'Recuenta de nuevo' });
      expect(res.status).toBeLessThan(300);
      const t = unwrap(res);
      expect(t.status).toBe('open');
      // Verificar que los balances quedaron sin actual/expected/diff
      const balances = await prisma.cashShiftBalance.findMany({ where: { cashShiftId: turnoId } });
      for (const b of balances) {
        expect(b.actualAmount).toBeNull();
        expect(b.expectedAmount).toBeNull();
        expect(b.difference).toBeNull();
      }
    });

    it('operator NO puede aprobar', async () => {
      const turnoId = await setUpPendingApproval();
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/aprobar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ approve: true, notes: 'intento' });
      expect(res.status).toBe(403);
    });

    it('rechaza aprobar turno no-pending_approval', async () => {
      const abr = await request(server)
        .post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      const turnoId = unwrap(abr).id;
      const res = await request(server)
        .post(`${PREFIX}/cajas/${turnoId}/aprobar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ approve: true, notes: 'sin razon' });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // GET /cajas + GET /cajas/:id
  // ============================================================
  describe('GET /cajas', () => {
    it('lista vacía si no hay turnos', async () => {
      const res = await request(server)
        .get(`${PREFIX}/cajas`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      const d = unwrap(res);
      expect(d.items).toEqual([]);
      expect(d.total).toBe(0);
    });

    it('admin ve todos los turnos del tenant', async () => {
      await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      const res = await request(server)
        .get(`${PREFIX}/cajas`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(unwrap(res).items.length).toBeGreaterThan(0);
    });

    it('operator solo ve sus propios turnos', async () => {
      // El cajero abre uno
      await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      const res = await request(server)
        .get(`${PREFIX}/cajas`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(200);
      const items = unwrap(res).items;
      for (const t of items) expect(t.userId).toBe(cajeroUserId);
    });

    it('aislamiento tenant — otro tenant no ve ni uno', async () => {
      await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      const res = await request(server)
        .get(`${PREFIX}/cajas`)
        .set('Authorization', `Bearer ${tokenCajeroOtroTenant}`);
      expect(res.status).toBe(200);
      expect(unwrap(res).items).toEqual([]);
    });
  });

  describe('GET /cajas/:id', () => {
    it('admin obtiene detalle', async () => {
      const abr = await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      const turnoId = unwrap(abr).id;

      const res = await request(server)
        .get(`${PREFIX}/cajas/${turnoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      const t = unwrap(res);
      expect(t.id).toBe(turnoId);
      expect(t.movements).toBeDefined();
      expect(t.balances).toBeDefined();
    });

    it('operator NO puede ver turno de otro user', async () => {
      // Admin abre un turno (a su nombre)
      const abr = await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      const turnoId = unwrap(abr).id;

      const res = await request(server)
        .get(`${PREFIX}/cajas/${turnoId}`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(403);
    });

    it('404 si turno no existe', async () => {
      const res = await request(server)
        .get(`${PREFIX}/cajas/00000000-0000-4000-8000-000000000000`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(404);
    });

    it('aislamiento tenant', async () => {
      const abr = await request(server).post(`${PREFIX}/cajas/abrir`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      const turnoId = unwrap(abr).id;

      const res = await request(server)
        .get(`${PREFIX}/cajas/${turnoId}`)
        .set('Authorization', `Bearer ${tokenCajeroOtroTenant}`);
      expect(res.status).toBe(404); // tenant guard hace que no exista para él
    });
  });
});
