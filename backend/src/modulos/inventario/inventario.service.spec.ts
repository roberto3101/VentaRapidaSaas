import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { TipoMovimiento } from '../../common/constantes/tipos-movimiento.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { Rol } from '../../common/constantes/roles.constant';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const VARIANT_ID = '22222222-2222-2222-2222-222222222222';
const LOCATION_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const mockMovimiento = {
  id: 'move-1',
  tenantId: TENANT_ID,
  variantId: VARIANT_ID,
  locationId: LOCATION_ID,
  quantity: 1,
  direction: -1,
  movementType: 'sale',
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
  rol: Rol.OPERATOR,
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
    const db = buildMockDb(0); // 0 units available
    const svc = new InventarioService(db);

    await expect(svc.crearMovimiento(baseDto, usuario)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // movement must NOT have been inserted
    expect(db._txMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('SELECT FOR UPDATE se ejecuta dentro de la transacción para movimientos de salida', async () => {
    const db = buildMockDb(10);
    const svc = new InventarioService(db);

    await svc.crearMovimiento(baseDto, usuario);

    // The $queryRaw call (SELECT ... FOR UPDATE) must happen inside the $transaction callback
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db._txMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('movimientos de entrada no disparan el SELECT FOR UPDATE', async () => {
    const db = buildMockDb(0); // stock=0 but must NOT block inbound
    const svc = new InventarioService(db);

    const result = await svc.crearMovimiento(
      { ...baseDto, tipoMovimiento: TipoMovimiento.COMPRA },
      usuario,
    );

    expect(db._txMock.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual(mockMovimiento);
  });
});

describe('InventarioService.revertirMovimiento — SIS-20 cross-tenant isolation', () => {
  const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const MOVE_ID = 'move-orig-1';

  const movimientoTenantB = {
    id: MOVE_ID,
    tenantId: TENANT_B,
    locationId: LOCATION_ID,
    variantId: VARIANT_ID,
    movementType: 'sale',
    quantity: 3,
    direction: -1,
    isReversal: false,
    contactId: null,
    transferId: null,
    referenceCode: null,
    unitCost: null,
    unitPrice: 10,
    taxRate: 18,
    taxAmount: 1.62,
    subtotal: 9,
    total: 10.62,
    currencyCode: 'PEN',
  };

  function buildRevertDb(overrides: {
    findFirstResult?: unknown;
    reversalExists?: boolean;
  }) {
    return {
      inventoryMovement: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(overrides.findFirstResult ?? null)
          .mockResolvedValueOnce(
            overrides.reversalExists ? { id: 'rev-1' } : null,
          ),
        create: jest.fn().mockResolvedValue({ id: 'reversal-new' }),
      },
    } as any;
  }

  it('happy path — revierte movimiento del tenant propio', async () => {
    const db = buildRevertDb({
      findFirstResult: { ...movimientoTenantB, tenantId: TENANT_ID },
    });
    const svc = new InventarioService(db);

    await svc.revertirMovimiento(MOVE_ID, 'error de precio', usuario);

    const createCall = db.inventoryMovement.create.mock.calls[0][0].data;
    expect(createCall.tenantId).toBe(TENANT_ID);
    expect(createCall.isReversal).toBe(true);
  });

  it('cross-tenant attack — lanza NotFoundException al intentar revertir movimiento de otro tenant (SIS-20)', async () => {
    // findFirst returns null because tenantId filter excludes tenant B's record
    const db = buildRevertDb({ findFirstResult: null });
    const svc = new InventarioService(db);

    const usuarioTenantA: JwtPayload = {
      sub: USER_ID,
      tenantId: TENANT_ID,
      email: 'attacker@tenant-a.com',
      rol: Rol.TENANT_ADMIN,
      sedesIds: [],
    };

    await expect(
      svc.revertirMovimiento(MOVE_ID, 'cross-tenant attempt', usuarioTenantA),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('no crea reversiuón si ya existe una para ese movimiento del tenant', async () => {
    const db = buildRevertDb({
      findFirstResult: { ...movimientoTenantB, tenantId: TENANT_ID },
      reversalExists: true,
    });
    const svc = new InventarioService(db);

    await expect(
      svc.revertirMovimiento(MOVE_ID, 'duplicado', usuario),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
