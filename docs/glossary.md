# Glosario ubicuo bilingüe — SistemaVentaRapida Pro

> Mantenido por el **Architect**. Versión: 2026-05-20.
>
> Esta es **la única fuente de verdad** para nombrar conceptos del dominio:
>
> - **Columna "Dominio (es)"** = término legal/de negocio/UI mostrado al usuario final (cajero, dueño, contador).
> - **Columna "Código (en)"** = identificador exacto que debe usarse en código TypeScript, esquema Prisma, rutas API, tests, ADRs y cualquier artefacto técnico.
>
> Cualquier agente (Backend Dev, Frontend Dev, DBA, QA, Security) que necesite usar un término nuevo del dominio: primero busca aquí. Si no existe, abre issue al Architect; **no** se inventan sinónimos.

## Cómo se aplica

1. **Modelos Prisma**: nombres de modelos y campos en inglés (columna derecha).
2. **Controllers y URLs**: rutas en inglés (`/sales`, `/cash-registers`, `/receipts/invoices`).
3. **DTOs y variables TypeScript**: en inglés.
4. **Strings de UI**: en español neutro LATAM, vienen de `frontend/lib/i18n/`. La UI no inventa traducciones inline.
5. **Comentarios en código**: en inglés (consistencia con identificadores).
6. **Mensajes de error al usuario**: en español, devueltos por backend desde catálogo i18n.

## Reglas para sumar términos

- Cada término nuevo trae **un ejemplo de uso real** del producto (ver columna "Notas").
- Si Perú y Venezuela usan distintos nombres legales, se documenta en "Notas". El nombre en código permanece único (no se crean dos modelos).
- Plurales en español respetan el género. En código todo es PascalCase singular para entidades, camelCase para campos.

---

## Tabla maestra

### Identidad y multi-tenant

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Tenant / Inquilino / Cliente SaaS | `Tenant` | El negocio que contrata SistemaVentaRapida. Tiene su propio aislamiento de datos. |
| País | `Country` | Catálogo. PE, VE, CO, BO, EC... Tenant tiene un `countryCode` ISO-3166-1 alpha-2. |
| Sucursal / Sede / Local | `Branch` | Punto físico de venta. **Nota**: en el código actual se llama `Location` — refactor pendiente (issue SIS-XX). |
| Caja registradora / Punto de cobro | `CashRegister` | Hardware/instancia dentro de una sucursal. 1 sucursal puede tener N cajas. |
| Usuario | `User` | Persona física que se autentica. |
| Rol | `Role` | `super_admin`, `tenant_admin`, `branch_manager`, `cashier`, `accountant`, `viewer`. **Nota**: enum actual usa `location_manager` y `operator` — refactor pendiente. |
| Sesión | `Session` | Token JWT + refresh. Tiempo de vida controlado por config. |
| Turno (de caja) | `Shift` | Periodo durante el cual un cajero opera una caja, con apertura y cierre. |
| Arqueo de caja / Cuadre | `CashCount` | Conteo físico vs sistema al cierre de turno. Diferencia se registra. |

### Catálogo

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Producto | `Product` | Item maestro. Puede tener variantes. |
| Variante / SKU | `ProductVariant` | Combinación específica (talla/color/presentación). Una unidad SKU vendible. |
| SKU (código interno) | `sku` | Campo de `ProductVariant`. Único por producto. |
| Código de barras | `barcode` | EAN-13 / EAN-8 / UPC-A. Único globalmente dentro del tenant. |
| Categoría | `Category` | Jerárquica (parent/child). |
| Marca | `Brand` | Atributo de `Product`. Catálogo libre. |
| Atributo de variante | `AttributeType` | Talla, color, presentación. |
| Unidad de medida | `UnitOfMeasure` | und, kg, lt, ml, m, paq, caja. |
| Lote | `Batch` / `Lot` | Para productos con fecha de vencimiento. **No implementado aún**. |
| Vencimiento | `expiresAt` | Fecha de vencimiento del lote. |

### Inventario y stock

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Inventario | `Inventory` | Bounded context. |
| Stock | `Stock` | Cantidad disponible. Tabla agregada: `InventoryStock`. |
| Movimiento de stock | `StockMovement` / `InventoryMovement` | Evento atómico de entrada/salida. |
| Entrada / Compra | `Purchase` (tipo de movimiento) | Compra a proveedor. |
| Salida / Venta | `Sale` (tipo de movimiento) | Salida por venta. |
| Transferencia entre sucursales | `Transfer` | Movimiento de stock entre branches. |
| Ajuste de inventario | `StockAdjustment` | Corrección manual con razón. |
| Stock mínimo / Punto de reorden | `minStock` / `reorderPoint` | Por variante por sucursal. |
| Stock reservado | `reservedQuantity` | Comprometido por ventas en curso o pedidos. |
| Disponible | `availableQuantity` | `quantity - reservedQuantity`. |
| Merma | `Shrinkage` | Salida sin venta (rotura, vencido, robo). |

### Venta y caja

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Venta | `Sale` | Transacción comercial. Una venta produce 1 comprobante y N movimientos de stock. |
| Línea de venta / Ítem | `SaleItem` | Una línea del ticket: variante + cantidad + precio. |
| Carrito (en curso) | `Cart` | Estado en frontend antes de cerrar venta. No persiste en BD. |
| Pago | `Payment` | Una venta puede tener N pagos (mixtos: efectivo + tarjeta). |
| Método de pago | `PaymentMethod` | `cash`, `card_debit`, `card_credit`, `transfer`, `wallet`, `credit_account`. |
| Vuelto | `change` | Efectivo entregado - total. |
| Descuento | `Discount` | Por línea (`SaleItem.discount`) o global (`Sale.discount`). |
| Anulación / Devolución | `Refund` / `Return` | Reverso parcial o total de una venta. |
| Cobro a cuenta / Fiado | `CreditSale` | Venta cobrada contra `CreditLine` del cliente. |

### Comprobantes fiscales

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Comprobante (genérico) | `Receipt` | Documento fiscal emitido por la venta. |
| Boleta de venta (PE) | `SaleReceipt` | Persona natural sin RUC. SUNAT tipo 03. |
| Factura electrónica (PE) | `InvoiceReceipt` | Persona con RUC. SUNAT tipo 01. |
| Factura (VE) | `InvoiceReceipt` | Tipo único en VE. Mismo modelo, distinto adaptador SENIAT. |
| Nota de crédito | `CreditNote` | Anula/corrige un comprobante. SUNAT tipo 07. |
| Nota de débito | `DebitNote` | Cargo adicional. SUNAT tipo 08. |
| Ticket (no fiscal) | `NonFiscalTicket` | Solo interno, no se reporta. |
| Serie | `series` | Ej. F001, B001. Configurable por sucursal y caja. |
| Correlativo | `sequence` | Número incremental por serie. |
| RUC | `taxId` (con `type: 'RUC'`) | Registro Único de Contribuyentes (PE). 11 dígitos, dígito de control. |
| RIF | `taxId` (con `type: 'RIF'`) | Registro de Información Fiscal (VE). Letra + 9 dígitos. |
| DNI | `idNumber` (con `type: 'DNI'`) | Documento Nacional de Identidad (PE). |
| CI / Cédula | `idNumber` (con `type: 'CI'`) | Cédula de Identidad (VE). |
| CDR (SUNAT) | `cdr` | Constancia de Recepción que devuelve SUNAT al recibir el XML. |
| XML firmado | `signedXml` | Comprobante en XML con firma digital del emisor. |
| Hash / código | `hashCode` | Resumen del comprobante usado por SUNAT/SENIAT. |

### Clientes, proveedores, crédito

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Cliente | `Customer` | Comprador. Sub-tipo de `Contact`. |
| Proveedor | `Supplier` | Vendedor. Sub-tipo de `Contact`. |
| Contacto (genérico) | `Contact` | Modelo común con discriminador. |
| Línea de crédito | `CreditLine` | Límite asignado a un cliente. |
| Cuenta por cobrar | `AccountReceivable` | Saldo pendiente del cliente. |
| Cuenta por pagar | `AccountPayable` | Saldo pendiente al proveedor. |

### Precios e impuestos

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Lista de precios | `PriceList` | Conjunto nombrado de precios (mayorista, minorista, promo). **No implementado aún**. |
| Precio por sucursal | `LocationPrice` / `BranchPrice` | Override de precio en una sucursal específica. |
| Precio efectivo | `effectivePrice` | Resultado de aplicar reglas (sucursal → lista → producto). |
| Promoción | `Promotion` | Precio temporal con fechas inicio/fin. |
| Impuesto / Tributo | `Tax` | Tabla maestra. |
| IGV (PE) | `Tax` con `code: 'IGV'` | 18% típico. Algunos productos exonerados/inafectos. |
| IVA (VE) | `Tax` con `code: 'IVA'` | 16% típico. |
| Tasa | `taxRate` | Porcentaje (ej. 18.00). |
| Base imponible | `taxableAmount` | Monto sobre el que se aplica el impuesto. |
| Monto del impuesto | `taxAmount` | `taxableAmount × taxRate / 100`. |
| Precio con impuesto | `priceWithTax` | Bruto. |
| Precio sin impuesto | `priceWithoutTax` | Neto. |

### Dinero y moneda

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Dinero | `Money` | Value Object: `{ amount: Decimal, currency: string }`. |
| Sol peruano | `PEN` | ISO-4217. |
| Bolívar venezolano | `VES` | ISO-4217. Históricamente volátil — ver ADR-004. |
| Dólar (USD) | `USD` | Moneda alterna común en VE. |
| Tipo de cambio | `ExchangeRate` | Diario, por par de monedas. **No implementado aún**. |
| Redondeo | `rounding` | Política definida por país (PE: 0.01; VE depende del régimen). |

### Reportes y operativos

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Reporte | `Report` | Documento generado bajo demanda o programado. |
| Cierre de caja (Z) | `ShiftClosure` / `CashRegisterZReport` | Reporte del turno al cerrar. |
| Cierre diario | `DailyClosure` | Consolidado del día. |
| Auditoría | `AuditLog` | Registro inmutable de operaciones. |
| Bitácora / Log | `Log` | Logs técnicos (no auditoría). |

### Conceptos arquitectónicos compartidos

| Dominio (es) | Código (en) | Notas |
|---|---|---|
| Dominio (capa) | `domain` | Carpeta interna por bounded context. Cero dependencias externas. |
| Aplicación (capa) | `application` | Use cases + ports. Depende solo de `domain`. |
| Infraestructura (capa) | `infrastructure` | Adapters concretos: Prisma, SUNAT, email, queue. |
| Interfaz (capa) | `interface` | Controllers HTTP, event handlers, CLI. |
| Caso de uso | `UseCase` | Una acción de aplicación. Ej. `CreateSaleUseCase`. |
| Puerto / Interfaz | `Port` | Interface en `application/ports/`. |
| Adaptador | `Adapter` | Implementación concreta del puerto. |
| Evento de dominio | `DomainEvent` | Ej. `SaleCompleted`, `StockDepleted`, `ShiftClosed`. |
| Outbox (transactional) | `OutboxEvent` | Tabla para garantizar entrega exactly-once al bus. |
| Idempotencia | `IdempotencyKey` | Header `Idempotency-Key` + tabla de claves usadas. |

---

## Anti-glosario (términos prohibidos)

- ❌ `Sede` en código → ✅ `Branch` (en código). La UI puede decir "Sede" o "Sucursal" según preferencia del tenant.
- ❌ `Categoria`, `Producto`, `Usuario` como nombres de archivo o clase → ✅ `Category`, `Product`, `User`.
- ❌ `Float`/`number` para dinero → ✅ `Decimal` siempre.
- ❌ `Cliente` y `Proveedor` como modelos separados → ✅ `Contact` con discriminador.
- ❌ `Voucher`/`Document` para comprobante fiscal → ✅ `Receipt` (genérico) o sub-tipo concreto.

---

## Términos pendientes de discusión (parking lot)

- ¿Cómo llamamos a la **caja chica** (petty cash) para movimientos no asociados a ventas? Propuesta: `PettyCashMovement`.
- Modelo de **garantía/RMA** (devoluciones post-venta por defecto de fábrica). Propuesta: `Warranty`, `WarrantyClaim`.
- **Programa de fidelización**: puntos por compra, redención. Propuesta: `LoyaltyProgram`, `LoyaltyAccount`.
- **Comisión a vendedor**: si se asocia comisión por usuario. Propuesta: `Commission`.
- **Picking / packing** para integraciones e-commerce. Probable fase tardía.

> Cuando uno de estos avance a desarrollo, el Architect crea el ADR correspondiente y mueve el término a la tabla maestra.

---

## Changelog del glosario

- **2026-05-20**: versión inicial, 70+ términos. Architect (SIS-1).
