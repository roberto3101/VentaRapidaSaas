import { BadRequestException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { TipoMovimiento } from '../../common/constantes/tipos-movimiento.constant';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

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
  role: 'cashier',
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
