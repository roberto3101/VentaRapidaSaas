/**
 * E2E — Módulo Pagos (ADR-018)
 *
 * Cubre 7 endpoints + integración con Cajas (CashMovement automático):
 *   POST   /api/v1/pagos                     (initiate)
 *   POST   /api/v1/pagos/:id/anular          (void)
 *   POST   /api/v1/pagos/:id/reembolsar      (refund)
 *   GET    /api/v1/pagos                     (listar)
 *   GET    /api/v1/pagos/:id                 (detalle)
 *   POST   /api/v1/pagos/store-credits       (crear credit)
 *   GET    /api/v1/pagos/store-credits       (listar credits)
 *
 * Requisitos:
 *   - BD corriendo + seed-prueba aplicado
 *   - Tablas cajas (test/cajas.e2e-spec ya las crea)
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

describe('PagosController (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaClient;

  let tokenAdmin: string;
  let tokenCajero: string;
  let tokenCajeroOtroTenant: string;
  let tenantId: string;
  let locationId: string;
  let cajeroUserId: string;

  const unwrap = (res: request.Response) =>
    res.body && typeof res.body === 'object' && 'datos' in res.body ? res.body.datos : res.body;

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

    const loginAdmin = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: ADMIN_EMAIL, contrasena: PASSWORD });
    expect(loginAdmin.status).toBeLessThan(300);
    tokenAdmin = unwrap(loginAdmin).tokenAcceso;

    const loginCajero = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: CAJERO_EMAIL, contrasena: PASSWORD });
    expect(loginCajero.status).toBeLessThan(300);
    tokenCajero = unwrap(loginCajero).tokenAcceso;

    const loginOtro = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email: CAJERO_OTRO_TENANT, contrasena: PASSWORD });
    expect(loginOtro.status).toBeLessThan(300);
    tokenCajeroOtroTenant = unwrap(loginOtro).tokenAcceso;

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

  /** Limpia data de payments + store_credits + cashShifts del tenant test (en orden de FK). */
  const limpiar = async () => {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.storeCredit.deleteMany({ where: { tenantId } });
    await prisma.cashMovement.deleteMany({ where: { cashShift: { tenantId } } });
    await prisma.cashShiftBalance.deleteMany({ where: { cashShift: { tenantId } } });
    await prisma.cashShift.deleteMany({ where: { tenantId } });
  };

  beforeEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
    await app.close();
  });

  const abrirTurnoCajero = async (opening = '100.00') => {
    const r = await request(server)
      .post(`${PREFIX}/cajas/abrir`)
      .set('Authorization', `Bearer ${tokenCajero}`)
      .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: opening }] });
    return unwrap(r);
  };

  // ============================================================
  // POST /pagos — iniciar
  // ============================================================
  describe('POST /pagos', () => {
    it('cash sin turno abierto → 400', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '15.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/turno/i);
    });

    it('cash con turno abierto → captured + CashMovement(in,sale)', async () => {
      const turno = await abrirTurnoCajero('100.00');
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '15.00', currencyCode: 'PEN', receivedAmount: '20.00' });
      expect(res.status).toBeLessThan(300);
      const p = unwrap(res);
      expect(p.status).toBe('captured');
      expect(p.method).toBe('cash');
      expect(Number(p.amount)).toBe(15);
      expect(Number(p.changeAmount)).toBe(5);
      expect(p.cashShiftId).toBe(turno.id);

      // Verificar movement automático
      const movs = await prisma.cashMovement.findMany({
        where: { cashShiftId: turno.id, reason: 'sale' },
      });
      expect(movs).toHaveLength(1);
      expect(Number(movs[0].amount)).toBe(15);
      expect(movs[0].referenceId).toBe(p.id);
    });

    it('idempotencyKey duplicado → devuelve el mismo Payment, NO duplica', async () => {
      await abrirTurnoCajero('100.00');
      const body = {
        method: 'cash', amount: '10.00', currencyCode: 'PEN',
        idempotencyKey: 'idem-aaaaaa-bbb-ccc',
      };
      const r1 = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`).send(body);
      expect(r1.status).toBeLessThan(300);
      const r2 = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`).send(body);
      expect(r2.status).toBeLessThan(300);
      expect(unwrap(r1).id).toBe(unwrap(r2).id);

      const count = await prisma.payment.count({ where: { tenantId, idempotencyKey: body.idempotencyKey } });
      expect(count).toBe(1);
    });

    it('cash con currency no abierta en el turno → 400', async () => {
      await abrirTurnoCajero('100.00');
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'USD' });
      expect(res.status).toBe(400);
    });

    it('store_credit válido → decrementa balance', async () => {
      // admin crea credit de S/50
      const credit = await prisma.storeCredit.create({
        data: { tenantId, originalAmount: '50.00', balance: '50.00', currencyCode: 'PEN', createdById: cajeroUserId },
      });
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'store_credit', amount: '30.00', currencyCode: 'PEN', storeCreditId: credit.id });
      expect(res.status).toBeLessThan(300);
      const p = unwrap(res);
      expect(p.status).toBe('captured');
      expect(p.storeCreditId).toBe(credit.id);

      const refreshed = await prisma.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(Number(refreshed.balance)).toBe(20);
      expect(refreshed.status).toBe('active');
    });

    it('store_credit consumo total → status=used', async () => {
      const credit = await prisma.storeCredit.create({
        data: { tenantId, originalAmount: '20.00', balance: '20.00', currencyCode: 'PEN', createdById: cajeroUserId },
      });
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'store_credit', amount: '20.00', currencyCode: 'PEN', storeCreditId: credit.id });
      expect(res.status).toBeLessThan(300);
      const refreshed = await prisma.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(refreshed.status).toBe('used');
      expect(Number(refreshed.balance)).toBe(0);
    });

    it('store_credit sin balance suficiente → 400', async () => {
      const credit = await prisma.storeCredit.create({
        data: { tenantId, originalAmount: '5.00', balance: '5.00', currencyCode: 'PEN' },
      });
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'store_credit', amount: '10.00', currencyCode: 'PEN', storeCreditId: credit.id });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/insuficiente/i);
    });

    it('store_credit sin storeCreditId → 400', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'store_credit', amount: '10.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
    });

    it('method=yape NO implementado → 501', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'yape', amount: '10.00', currencyCode: 'PEN' });
      expect(res.status).toBe(501);
    });

    it('amount = 0 → 400', async () => {
      await abrirTurnoCajero('100.00');
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '0.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
    });

    it('sin auth → 401', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });
      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // POST /pagos/:id/anular
  // ============================================================
  describe('POST /pagos/:id/anular', () => {
    it('NO permite anular un pago capturado (usar reembolsar)', async () => {
      await abrirTurnoCajero('100.00');
      const ini = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '10.00', currencyCode: 'PEN' });
      const pago = unwrap(ini);

      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/anular`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ motivo: 'me equivoqué' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/reembolsar/i);
    });
  });

  // ============================================================
  // POST /pagos/:id/reembolsar
  // ============================================================
  describe('POST /pagos/:id/reembolsar', () => {
    const setupCaptured = async (amount = '20.00') => {
      const turno = await abrirTurnoCajero('100.00');
      const r = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount, currencyCode: 'PEN' });
      return { turnoId: turno.id, pago: unwrap(r) };
    };

    it('operator NO puede reembolsar', async () => {
      const { pago } = await setupCaptured('10.00');
      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/reembolsar`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ amount: '10.00', motivo: 'devolución cliente' });
      expect(res.status).toBe(403);
    });

    it('admin reembolso cash total → status=refunded + CashMovement(out,refund)', async () => {
      const { pago } = await setupCaptured('30.00');
      // admin necesita su propio turno para refund cash
      const turnoAdmin = await request(server)
        .post(`${PREFIX}/cajas/abrir`).set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      const tAdmin = unwrap(turnoAdmin);

      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/reembolsar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '30.00', motivo: 'devolución producto defectuoso' });
      expect(res.status).toBeLessThan(300);
      const refund = unwrap(res);
      expect(refund.method).toBe('cash');
      expect(Number(refund.amount)).toBe(-30);
      expect(refund.refundOfPaymentId).toBe(pago.id);

      const original = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
      expect(original.status).toBe('refunded');
      expect(Number(original.refundedAmount)).toBe(30);

      // CashMovement out, refund
      const out = await prisma.cashMovement.findMany({
        where: { cashShiftId: tAdmin.id, reason: 'refund' },
      });
      expect(out).toHaveLength(1);
      expect(Number(out[0].amount)).toBe(30);
    });

    it('admin reembolso parcial → status sigue captured, refundedAmount actualizado', async () => {
      const { pago } = await setupCaptured('40.00');
      await request(server)
        .post(`${PREFIX}/cajas/abrir`).set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/reembolsar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '15.00', motivo: 'devolución parcial' });
      expect(res.status).toBeLessThan(300);
      const orig = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
      expect(orig.status).toBe('captured');
      expect(Number(orig.refundedAmount)).toBe(15);
    });

    it('reembolso > monto restante → 400', async () => {
      const { pago } = await setupCaptured('10.00');
      await request(server)
        .post(`${PREFIX}/cajas/abrir`).set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });

      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/reembolsar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '15.00', motivo: 'demasiado' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/excede/i);
    });

    it('reembolso store_credit → devuelve balance + reactiva si era used', async () => {
      const credit = await prisma.storeCredit.create({
        data: { tenantId, originalAmount: '50.00', balance: '50.00', currencyCode: 'PEN' },
      });
      // operator captura store_credit por S/50 (consume todo)
      const ini = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'store_credit', amount: '50.00', currencyCode: 'PEN', storeCreditId: credit.id });
      const pago = unwrap(ini);
      const c1 = await prisma.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(c1.status).toBe('used');

      // admin reembolsa S/20
      const res = await request(server)
        .post(`${PREFIX}/pagos/${pago.id}/reembolsar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '20.00', motivo: 'devolución parcial' });
      expect(res.status).toBeLessThan(300);
      const c2 = await prisma.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(Number(c2.balance)).toBe(20);
      expect(c2.status).toBe('active'); // reactivado
    });
  });

  // ============================================================
  // POST /pagos/store-credits
  // ============================================================
  describe('POST /pagos/store-credits', () => {
    it('operator NO puede crear', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos/store-credits`)
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({ amount: '50.00', currencyCode: 'PEN' });
      expect(res.status).toBe(403);
    });

    it('admin crea — balance == originalAmount', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos/store-credits`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '75.00', currencyCode: 'PEN', notes: 'Gift card aniversario' });
      expect(res.status).toBeLessThan(300);
      const c = unwrap(res);
      expect(Number(c.originalAmount)).toBe(75);
      expect(Number(c.balance)).toBe(75);
      expect(c.status).toBe('active');
    });

    it('rechaza amount=0', async () => {
      const res = await request(server)
        .post(`${PREFIX}/pagos/store-credits`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ amount: '0.00', currencyCode: 'PEN' });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // GET /pagos + GET /pagos/:id
  // ============================================================
  describe('GET /pagos', () => {
    it('lista vacía', async () => {
      const res = await request(server)
        .get(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(unwrap(res).items).toEqual([]);
    });

    it('operator solo ve los suyos', async () => {
      await abrirTurnoCajero('50.00');
      await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });

      const res = await request(server)
        .get(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(200);
      const items = unwrap(res).items;
      expect(items.length).toBeGreaterThan(0);
      for (const p of items) expect(p.createdById).toBe(cajeroUserId);
    });

    it('aislamiento tenant — otro tenant no ve nada', async () => {
      await abrirTurnoCajero('50.00');
      await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });

      const res = await request(server)
        .get(`${PREFIX}/pagos`)
        .set('Authorization', `Bearer ${tokenCajeroOtroTenant}`);
      expect(res.status).toBe(200);
      expect(unwrap(res).items).toEqual([]);
    });

    it('filtro por status=captured', async () => {
      await abrirTurnoCajero('50.00');
      await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });

      const res = await request(server)
        .get(`${PREFIX}/pagos?status=captured`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      const items = unwrap(res).items;
      for (const p of items) expect(p.status).toBe('captured');
    });
  });

  describe('GET /pagos/:id', () => {
    it('admin obtiene detalle', async () => {
      await abrirTurnoCajero('50.00');
      const ini = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenCajero}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });
      const id = unwrap(ini).id;

      const res = await request(server)
        .get(`${PREFIX}/pagos/${id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(unwrap(res).id).toBe(id);
    });

    it('operator NO ve pago de otro user', async () => {
      // admin abre turno + crea payment
      const turnoAdminRes = await request(server)
        .post(`${PREFIX}/cajas/abrir`).set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ locationId, openingAmounts: [{ currencyCode: 'PEN', openingAmount: '50.00' }] });
      expect(turnoAdminRes.status).toBeLessThan(300);
      const ini = await request(server)
        .post(`${PREFIX}/pagos`).set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ method: 'cash', amount: '5.00', currencyCode: 'PEN' });
      const id = unwrap(ini).id;

      const res = await request(server)
        .get(`${PREFIX}/pagos/${id}`)
        .set('Authorization', `Bearer ${tokenCajero}`);
      expect(res.status).toBe(403);
    });

    it('404 si no existe', async () => {
      const res = await request(server)
        .get(`${PREFIX}/pagos/00000000-0000-4000-8000-000000000000`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(404);
    });
  });
});
