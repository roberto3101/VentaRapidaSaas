import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { TipoMovimiento } from '../../common/constantes/tipos-movimiento.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import type { Rol } from '../../common/constantes/roles.constant';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VARIANT_ID = '22222222-2222-2222-2222-222222222222';
const LOCATION_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';
const MOVE_ID = 'move-1';

const mockMovimiento = {
  id: MOVE_ID,
  tenantId: TENANT_ID,
  variantId: VARIANT_ID,
  locationId: LOCATION_ID,
  quantity: 1,
  direction: -1,
  movementType: 'sale',
  isReversal: false,
  variant: { product: { name: 'Producto Test' } },
  location: { name: 'Sede Principal' },
  contact: null,
  creator: { id: USER_ID, fullName: 'Roberto' },
};

function buildMockDb(availableQty: number) {
  const txMock = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ available_quantity: availableQty }]),
    inventoryMovement: {
      create: jest.fn().mockResolvedValue(mockMovimiento),
    },
  };

  return {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: TENANT_ID,
        allowNegativeStock: false,
        taxIncluded: true,
        currencyCode: 'PEN',
      }),
    },
    obtenerPrecioEfectivo: jest.fn().mockResolvedValue(10),
    obtenerTasaImpuestoEfectiva: jest.fn().mockResolvedValue(18),
    $transaction: jest
      .fn()
      .mockImplementation((fn: (tx: typeof txMock) => Promise<unknown>) =>
        fn(txMock),
      ),
    _txMock: txMock,
  } as any;
}

function buildRevertirDb(overrides: {
  original?: Record<string, unknown> | null;
  yaTieneReversion?: Record<string, unknown> | null;
}) {
  const findFirstCalls: Array<Record<string, unknown>> = [];
  return {
    inventoryMovement: {
      findFirst: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
        findFirstCalls.push(args.where);
        // First call: lookup by id → return original movement (or null)
        if (args.where['id'] !== undefined) {
          return Promise.resolve(
            overrides.original !== undefined
              ? overrides.original
              : { ...mockMovimiento, tenantId: TENANT_ID },
          );
        }
        // Second call: duplicate-reversal check
        return Promise.resolve(overrides.yaTieneReversion ?? null);
      }),
      create: jest.fn().mockResolvedValue({ ...mockMovimiento, isReversal: true }),
    },
    _findFirstCalls: findFirstCalls,
  } as any;
}

const baseDto = {
  varianteId: VARIANT_ID,
  sedeId: LOCATION_ID,
  tipoMovimiento: TipoMovimiento.VENTA,
  cantidad: 1,
};

const usuario: JwtPayload = {
  sub: USER_ID,
  tenantId: TENANT_ID,
  email: 'test@test.com',
  rol: 'operator' as Rol,
  sedesIds: [LOCATION_ID],
};

describe('InventarioService.crearMovimiento', () => {
  it('happy path — crea el movimiento cuando hay stock suficiente', async () => {
    const db = buildMockDb(5);
    const svc = new InventarioService(db);

    const result = await svc.crearMovimiento(baseDto, usuario);

    expect(db._txMock.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockMovimiento);
  });

  it('oversell guard — lanza BadRequestException cuando stock < cantidad solicitada (SIS-24)', async () => {
    const db = buildMockDb(0);
    const svc = new InventarioService(db);

    await expect(svc.crearMovimiento(baseDto, usuario)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db._txMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('SELECT FOR UPDATE se ejecuta dentro de la transacción para movimientos de salida', async () => {
    const db = buildMockDb(10);
    const svc = new InventarioService(db);

    await svc.crearMovimiento(baseDto, usuario);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db._txMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('movimientos de entrada no disparan el SELECT FOR UPDATE', async () => {
    const db = buildMockDb(0);
    const svc = new InventarioService(db);

    const result = await svc.crearMovimiento(
      { ...baseDto, tipoMovimiento: TipoMovimiento.COMPRA },
      usuario,
    );

    expect(db._txMock.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual(mockMovimiento);
  });
});

describe('InventarioService.revertirMovimiento (SIS-20)', () => {
  it('happy path — revierte el movimiento del mismo tenant', async () => {
    const db = buildRevertirDb({});
    const svc = new InventarioService(db);

    const result = await svc.revertirMovimiento(MOVE_ID, 'error de caja', usuario);

    expect(db.inventoryMovement.create).toHaveBeenCalledTimes(1);
    const created = (db.inventoryMovement.create.mock.calls[0] as Array<{ data: { tenantId: string } }>)[0].data;
    expect(created.tenantId).toBe(TENANT_ID);
    expect(result.isReversal).toBe(true);
  });

  it('rechaza cross-tenant — no filtra movimiento de otro tenant (SIS-20)', async () => {
    const db = buildRevertirDb({ original: null });
    const svc = new InventarioService(db);

    const otherUser: JwtPayload = { ...usuario, tenantId: OTHER_TENANT_ID };

    await expect(
      svc.revertirMovimiento(MOVE_ID, 'test', otherUser),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('el findFirst incluye tenantId del caller en el where (SIS-20)', async () => {
    const db = buildRevertirDb({});
    const svc = new InventarioService(db);

    await svc.revertirMovimiento(MOVE_ID, 'test', usuario);

    const firstCall = db._findFirstCalls[0] as { id?: string; tenantId?: string };
    expect(firstCall.id).toBe(MOVE_ID);
    expect(firstCall.tenantId).toBe(TENANT_ID);
  });

  it('lanza BadRequestException si el movimiento es una reversión', async () => {
    const db = buildRevertirDb({ original: { ...mockMovimiento, isReversal: true } });
    const svc = new InventarioService(db);

    await expect(
      svc.revertirMovimiento(MOVE_ID, 'test', usuario),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza BadRequestException si el movimiento ya fue revertido', async () => {
    const db = buildRevertirDb({ yaTieneReversion: { id: 'rev-existing' } });
    const svc = new InventarioService(db);

    await expect(
      svc.revertirMovimiento(MOVE_ID, 'test', usuario),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
