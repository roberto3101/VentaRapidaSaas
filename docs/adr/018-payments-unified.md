# ADR-018: Pagos unificados — un solo bounded context, strategy pattern por método

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-58

## Context

El POS debe aceptar efectivo, Yape, Plin, tarjeta, transferencia, crédito en cuenta, y mañana TAPP del BCRP ([Infobae — BCR lanzará TAPP fines 2026](https://www.infobae.com/peru/2026/04/27/fin-del-monopolio-de-las-apps-bancarias-bcr-lanzara-tapp-la-plataforma-para-pagar-con-un-solo-clic-a-fines-del-2026/)). Cada uno tiene mecánica distinta:

- **Efectivo**: instantáneo, sin pasarela, afecta arqueo ([[009-cash-shifts]]).
- **Yape**: vía agregador (MercadoPago / Culqi) con OTP del cliente; límite S/2000 por tx ([Culqi — Cargo Único Yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos/)).
- **Plin**: similar a Yape, agregadores y QR interoperable.
- **Tarjeta**: Niubiz / Izipay (POS físico) o pasarela web (3DS).
- **Transferencia**: manual, sin confirmación automática salvo open banking futuro.
- **Crédito en cuenta**: cliente debe a tienda, se cobra después.
- **TAPP** (fin 2026): plataforma estatal BCRP modelo UPI India.

**Riesgo arquitectónico real** que el usuario explicitó: si cada método se implementa donde se necesite (Yape en `sales/`, devolución en `returns/`, tarjeta en `pos/`), el código se dispersa, se duplican validaciones, cambiar Culqi → MercadoPago requiere tocar 5 sitios. Inaceptable.

[[003-fiscal-emission-hexagonal]] resolvió esto para SUNAT con Hexagonal. Aplicamos el mismo patrón a pagos.

## Decision

### 1. Un solo bounded context `modules/payments/` — TODO pago vive aquí

```
backend/src/modules/payments/
├── CLAUDE.md
├── domain/
│   ├── entities/
│   │   ├── payment.entity.ts
│   │   └── payment-method.entity.ts          ← config por tenant
│   ├── value-objects/
│   │   ├── payment-status.vo.ts              ← initiated | authorized | captured | failed | refunded | voided
│   │   └── payment-method-code.vo.ts         ← 'cash' | 'yape' | 'plin' | 'card' | 'transfer' | 'store_credit' | 'tapp'
│   ├── events/
│   │   ├── payment-captured.event.ts
│   │   ├── payment-failed.event.ts
│   │   └── payment-refunded.event.ts
│   └── errors/
│       ├── payment-method-not-enabled.error.ts
│       ├── payment-limit-exceeded.error.ts
│       └── payment-mismatch.error.ts
├── application/
│   ├── ports/
│   │   ├── payment-strategy.port.ts          ← IPaymentStrategy — el contrato común
│   │   ├── payment-strategy-registry.port.ts ← IPaymentStrategyRegistry — selector
│   │   └── payment-repository.port.ts
│   ├── use-cases/
│   │   ├── initiate-payment.use-case.ts
│   │   ├── confirm-payment.use-case.ts       ← llamado por webhook handler
│   │   ├── void-payment.use-case.ts
│   │   └── refund-payment.use-case.ts
│   └── dto/
└── infrastructure/
    ├── persistence/
    │   └── prisma-payment.repository.ts
    └── adapters/
        ├── cash/
        │   └── cash-payment.strategy.ts             ← simple, sin pasarela
        ├── yape/
        │   ├── culqi-yape-payment.strategy.ts       ← implementación con Culqi
        │   └── mercadopago-yape-payment.strategy.ts ← implementación con MercadoPago (alternativa)
        ├── plin/
        │   └── ...
        ├── card/
        │   ├── niubiz-card-payment.strategy.ts
        │   └── izipay-card-payment.strategy.ts
        ├── transfer/
        ├── store-credit/
        │   └── store-credit-payment.strategy.ts     ← consume StoreCredit de [[011]]
        └── tapp/                                     ← futuro
```

### 2. Puerto común `IPaymentStrategy`

```ts
export interface IPaymentStrategy {
  readonly code: PaymentMethodCode;                  // 'yape', 'cash', ...
  readonly displayName: string;                       // "Yape"
  readonly requiresOnlineConfirmation: boolean;      // true = webhook después
  readonly maxAmountPerTx?: Money;                   // ej. Yape Culqi: S/2000
  readonly currencies: CurrencyCode[];               // monedas aceptadas

  /** Inicia el pago. Devuelve estado actual + datos adicionales (QR, redirect URL, OTP request id). */
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /** Confirma un pago previamente iniciado (típicamente desde webhook). */
  confirm(payment: Payment, providerPayload: unknown): Promise<ConfirmPaymentResult>;

  /** Anula un pago no capturado (cancelación pre-captura). */
  void(payment: Payment, reason: string): Promise<VoidPaymentResult>;

  /** Reembolsa un pago capturado. Parcial o total. */
  refund(payment: Payment, amount: Money, reason: string): Promise<RefundPaymentResult>;
}

export type InitiatePaymentResult =
  | { status: 'captured'; capturedAt: Date; providerTxId: string }                       // efectivo
  | { status: 'authorized'; providerTxId: string }                                       // tarjeta pre-auth
  | { status: 'awaiting_confirmation'; providerTxId: string; qrCode?: string; redirectUrl?: string; expiresAt: Date }; // Yape, transfer
```

### 3. Registry + factoría

```ts
@Injectable()
export class PaymentStrategyRegistry implements IPaymentStrategyRegistry {
  constructor(
    @Inject(CASH_STRATEGY) private cash: IPaymentStrategy,
    @Inject(YAPE_STRATEGY) private yape: IPaymentStrategy,
    // ...
  ) {}

  for(tenantId: string, methodCode: PaymentMethodCode): IPaymentStrategy {
    const tenant = this.tenantRepo.find(tenantId);
    if (!tenant.enabledPaymentMethods.includes(methodCode)) {
      throw new PaymentMethodNotEnabledError(methodCode);
    }
    return this.byCode(methodCode);
  }
}
```

El use case `InitiatePaymentUseCase` recibe el `IPaymentStrategyRegistry`, **nunca** un strategy concreto. Cambiar Culqi por MercadoPago = cambiar el provider en el módulo de wiring, cero líneas en use cases.

### 4. Regla inviolable — NADIE importa Yape/Culqi/Niubiz fuera de `modules/payments/`

- `sales/` solo conoce el port `IPaymentStrategy` y el registry.
- `returns/` solo conoce el use case `RefundPaymentUseCase`.
- `cash-shifts/` escucha el evento `PaymentCaptured(method='cash')` para actualizar `expectedAmount`.
- Frontend solo conoce el endpoint `POST /api/v1/payments/initiate` con `{ saleId, methodCode, amount, providerData? }`.

`arch-lint` ([[008-clean-architecture-layers]] §7) agrega regla 6: imports de SDK de pasarelas (`culqi-node`, `mercadopago`, etc.) solo permitidos dentro de `modules/payments/infrastructure/adapters/<provider>/`.

### 5. Schema — un solo modelo `payments` para todos los métodos

```
payments:
  id (uuid)
  tenant_id, location_id
  sale_id (FK) o return_id (FK) — XOR
  cash_shift_id (FK nullable, set si method=cash o refund cash)
  method_code (text — 'cash' | 'yape' | 'plin' | 'card' | 'transfer' | 'store_credit' | 'tapp')
  provider (text nullable — 'culqi' | 'mercadopago' | 'niubiz' | 'izipay' | null para cash/store_credit)
  status (text — 'initiated' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'voided' | 'expired')
  amount (Decimal 18,6)
  currency_code (char 3)
  amount_in_document_currency (Decimal 18,6) — convertido per [[004-money-and-currency]]

  provider_tx_id (text nullable, unique con provider) — id en la pasarela
  provider_payload (jsonb nullable) — snapshot del webhook que confirmó
  initiated_at (timestamptz)
  authorized_at (timestamptz nullable)
  captured_at (timestamptz nullable)
  failed_at (timestamptz nullable)
  failure_reason (text nullable)
  refunded_at (timestamptz nullable)
  refunded_amount (Decimal nullable)

  idempotency_key (text — generado por backend al inicio del pago, devuelto al frontend para reintentos)
  audit_actor_id (uuid — quién inició)

  @@unique([provider, provider_tx_id])  -- evita doble registro del mismo pago externo
  @@index([sale_id, status])
  @@index([cash_shift_id]) where (cash_shift_id is not null)
```

**Una sola tabla `payments`** cubre los 7+ métodos. No hay `cash_payments`, `yape_payments`, etc. Discriminación por `method_code`.

### 6. Transaccionalidad — pago siempre dentro de transacción

Caso A — método **síncrono** (`cash`, `store_credit`):

```ts
// dentro de la transacción de venta de [[005-sale-concurrency]]
async createSale(...) {
  return this.db.$transaction(async tx => {
    // ... lock stock, crear Sale, SaleItems
    for (const paymentInput of input.payments) {
      const strategy = this.registry.for(tenantId, paymentInput.methodCode);
      if (strategy.requiresOnlineConfirmation) {
        // crear Payment 'awaiting_confirmation' y postergar
        await tx.payment.create({ data: { status: 'initiated', ... } });
      } else {
        // ejecutar dentro de la transacción
        const result = await strategy.initiate({ ... });
        await tx.payment.create({ data: { status: result.status, ... } });
        if (paymentInput.methodCode === 'cash') {
          await tx.cashMovement.create({ data: { shiftId, type: 'in', ... } });
        }
      }
    }
    // crear OutboxEvent SaleCompleted solo si TODOS los Payment están 'captured'
  }, { isolationLevel: 'Serializable', timeout: 10_000 });
}
```

Caso B — método **asíncrono** (`yape`, `card 3DS`, `transfer`):

1. **Transacción 1 (venta)**: crea Sale + SaleItems + Payments con `status='initiated'`. Decrementa stock. Commit. La emisión fiscal espera (outbox condicional).
2. Strategy `.initiate()` llama a Culqi/MercadoPago/etc., obtiene `providerTxId` + QR/redirect. Update Payment a `status='awaiting_confirmation'` en transacción 2 separada.
3. UI muestra QR / pide OTP / abre redirect.
4. Pasarela cobra → envía webhook.
5. **Transacción 3 (confirm payment)**: `WebhookHandler` ([[021-webhook-security]]) valida HMAC + idempotencia, llama `ConfirmPaymentUseCase` que update Payment a `status='captured'`. Si TODOS los Payment de la Sale están `captured` → emite `SaleFullyPaidEvent` que dispara emisión fiscal.
6. Si el webhook nunca llega en `expiresAt` (típico 5-15 min) → job marca Payment como `expired`, libera stock vía `InventoryMovement` reverse, marca Sale como `cancelled_payment_expired`.

**Toda mutación de pago es transaccional.** Nada se actualiza con `findAndUpdate` fuera de `$transaction`.

### 7. Adapters concretos del MVP

| Strategy | Provider | Notas |
|---|---|---|
| `CashPaymentStrategy` | — | Síncrono. Conexión con `modules/cash/` para `CashMovement`. |
| `CulqiYapePaymentStrategy` | Culqi | Token Yape vía Culqi.js (frontend captura phone + OTP), backend POST `/v2/charges` ([Culqi Tokens Yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)). Límite S/2000 por tx ([Culqi Cargo Único](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos/)). |
| `MercadoPagoYapePaymentStrategy` | MercadoPago | Alternativa: SDK MP genera token con phone+OTP, POST `/v1/payments` con `payment_method_id='yape'` ([MercadoPago Yape integración](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-payments/integration-configuration/yape)). |
| `NiubizCardPaymentStrategy` | Niubiz | Botón Web Niubiz para e-commerce, POS terminal-based fuera de alcance MVP ([Niubiz Documento Integración Pago Web PDF](https://www.niubiz.com.pe/wp-content/uploads/2020/11/Documento-de-Integracio%CC%81n-Pago-Web.pdf)). |
| `TransferPaymentStrategy` | — | Manual: cajero confirma físicamente que vio el voucher; Payment va directo a `status='captured'`. Webhook nunca llega. |
| `StoreCreditPaymentStrategy` | — | Decrementa `store_credits.balance` per [[011]]. Síncrono, dentro de transacción. |

**Plin**: por interoperabilidad QR del BCRP ([BCRP Estrategia interoperabilidad](https://www.bcrp.gob.pe/sistema-de-pagos/interoperabilidad/estrategia-de-interoperabilidad-de-los-pagos-minoristas.html)), un solo QR sirve para Yape Y Plin (y otras). Modelado como `code='qr_interop'` con `provider='culqi'|'mercadopago'`. **TAPP** entrará como `code='tapp'` cuando BCRP publique API (esperado fines 2026 / inicios 2027).

### 8. Configuración por tenant — qué métodos habilitar

```
tenant_payment_methods:
  id, tenant_id, method_code, provider
  enabled (bool)
  display_order (int)            -- orden en el modal de pago
  credentials_encrypted (jsonb)  -- claves API del tenant (Culqi, Niubiz), encriptadas con CERT_MASTER_KEY ([[012]])
  config (jsonb)                 -- ej. {feeRate: 2.95, autoReconcile: true}
  created_at, updated_at
```

**No hay credenciales hardcoded.** Cada tenant trae sus llaves Culqi/Niubiz. El frontend nunca ve credenciales — el backend resuelve el strategy + carga credentials en cada `.initiate()`.

### 9. Costos y caps — visibilidad al tenant

Cada strategy declara `getCostEstimate(amount, currency)`:

- Culqi Yape: 2.95% + S/1.50 por tx (rango público, validar al cargar credentials).
- Yape Empresa (sin agregador): 2.95% sobre el total ([Yape Empresa costos](https://www.yape.com.pe/preguntas-frecuentes/yape-empresa/yape-empresa-tiene-algun-costo)).
- Tarjeta Niubiz: ~3.49% + S/0.39 (varía por contrato del tenant — config).
- Efectivo / store_credit: 0%.

UI del POS muestra "Costo estimado" cuando el cajero selecciona método (útil para que el tenant entienda). Reporte mensual de costos por pasarela.

### 10. Reembolsos — un solo flujo, multi-método

`RefundPaymentUseCase` recibe `(paymentId, amount, reason)`:

- Resuelve strategy del payment original.
- Llama `strategy.refund(payment, amount, reason)`.
- Si OK → crea **nuevo** Payment row con `method_code` igual al original, `amount` negativo (o columna `is_refund=true`), `status='refunded'`, ref al original via `refund_of_payment_id`.
- Si método = `cash` → genera `CashMovement(out)` automático en el turno actual.
- Si método = `card` → strategy llama Niubiz refund endpoint.
- Si método = `yape` → la mayoría no permiten reverso técnico → fallback a `store_credit` ([[011]] §4).

**Toda esta lógica en `modules/payments/`.** `modules/returns/` solo dispara el use case.

## Consequences

- ✅ Agregar pasarela nueva (TAPP, Bitkub, lo que sea) = 1 nueva carpeta `adapters/<provider>/`, factory lo registra, cero cambios en `sales/`/`returns/`/UI.
- ✅ Cambiar Culqi → MercadoPago = swap del provider en el módulo de wiring + actualizar credenciales del tenant. Cero cambios en use cases.
- ✅ Multi-pago split tender soportado nativo (Square pattern).
- ✅ Auditoría completa de cada pago en una sola tabla.
- ✅ Configuración por tenant — cada bodega/minimarket habilita sus métodos.
- ✅ Costos transparentes — el tenant ve qué le cobra cada pasarela.
- ⚠️ Estado `awaiting_confirmation` introduce UX async (QR + polling). Mitigación: timeout claro, status polling cada 2s, cancelar manual disponible.
- ⚠️ Idempotency clave para webhooks de Yape/MP (pueden duplicar) — abordado en [[021-webhook-security]].
- 🔓 Riesgo abierto: Culqi y MercadoPago tienen SLAs distintos y caídas independientes. Mitigación: tenant puede activar 2 providers y la UI hace fallback al alternativo si el primario falla en `.initiate()`.
- 🔓 Riesgo abierto: TAPP del BCRP aún sin API pública. Strategy queda registrado como stub `tapp` hasta que liberen specs.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Cada método con su propio módulo (`yape/`, `tarjeta/`, `efectivo/`) | Es exactamente lo que el usuario pidió evitar. Disperso, duplica validaciones, dolor para mantener. |
| B. Tabla por método (`cash_payments`, `yape_payments`, ...) | JOINs polimórficos, dificulta reportes consolidados. Una tabla con discriminador gana. |
| C. Llamar Culqi/MP/Niubiz directo desde `SalesService` | Acopla venta a estado pasarela. Si MP cae, no se vende. Hexagonal lo previene. |
| D. Multi-pago en fase 2 | El POS minimarket lo necesita día 1. |
| E. Credenciales pasarela hardcoded en env vars | Cada tenant tiene SUS llaves Culqi. Compartir = ilegal y bug fiscal. |
| F. Devolución en cada módulo (returns lo hace para yape, otro para card) | Misma trampa de dispersión. `modules/payments/` es el dueño único. |

## Implementation plan

1. Schema `payments` + `tenant_payment_methods` con discriminator (DBA, SIS-XX). Migración aditiva desde `Sale.payments` actual.
2. `modules/payments/` esqueleto + `IPaymentStrategy` port + `PaymentStrategyRegistry` (Backend Dev, SIS-XX).
3. `CashPaymentStrategy` + `StoreCreditPaymentStrategy` (síncronos, simples) (Backend Dev).
4. `CulqiYapePaymentStrategy` con SDK Culqi (Backend Dev).
5. `MercadoPagoYapePaymentStrategy` alternativa (Backend Dev).
6. `NiubizCardPaymentStrategy` (Backend Dev).
7. `TransferPaymentStrategy` manual (Backend Dev).
8. `ConfirmPaymentUseCase` invocado por webhook handler de [[021]] (Backend Dev).
9. `RefundPaymentUseCase` con fallback a `store_credit` (Backend Dev).
10. UI: modal de pago en POS con multi-strategy (Frontend Dev per [[017]] §5).
11. UI: settings de tenant para habilitar métodos + cargar credentials (Frontend Dev).
12. arch-lint rule 6: SDKs de pasarela solo dentro de su adapter (DBA + Backend Dev).
13. Tests: split tender, refund fallback, OTP timeout, webhook dedup (QA).

## References

- [[003-fiscal-emission-hexagonal]] · [[004-money-and-currency]] · [[005-sale-concurrency]] · [[008-clean-architecture-layers]] · [[009-cash-shifts]] · [[011-returns-and-credit-notes]] · [[012-sunat-production-hardening]] · [[017-fast-checkout-unified]] · [[021-webhook-security]]
- Yape Empresa costos (2.95%): https://www.yape.com.pe/preguntas-frecuentes/yape-empresa/yape-empresa-tiene-algun-costo
- Culqi — Tokens Yape: https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape
- Culqi — Cargo Único (límite S/2000): https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos/
- MercadoPago — Yape integración: https://www.mercadopago.com.pe/developers/es/docs/checkout-api-payments/integration-configuration/yape
- MercadoPago — Integra Yape con Checkout API: https://www.mercadopago.com.pe/developers/es/news/2024/07/19/Integrate-Yape-into-Checkout-API-with-the-support-of-the-new-documentation
- Niubiz — Botón de pago Yape: https://www.niubiz.com.pe/soluciones/boton-pago-yape
- Niubiz — Documento Integración Pago Web (PDF): https://www.niubiz.com.pe/wp-content/uploads/2020/11/Documento-de-Integracio%CC%81n-Pago-Web.pdf
- BCRP — Estrategia interoperabilidad pagos minoristas: https://www.bcrp.gob.pe/sistema-de-pagos/interoperabilidad/estrategia-de-interoperabilidad-de-los-pagos-minoristas.html
- BCRP — White paper interoperabilidad (PDF): https://www.bcrp.gob.pe/eng-docs/Publications/white-paper-interoperability.pdf
- TAPP BCRP — Infobae: https://www.infobae.com/peru/2026/04/27/fin-del-monopolio-de-las-apps-bancarias-bcr-lanzara-tapp-la-plataforma-para-pagar-con-un-solo-clic-a-fines-del-2026/
- Square — Split Payment scenario: https://developer.squareup.com/docs/payments/scenarios/split-online-payment
- Square — Process split tender: https://squareup.com/help/us/en/article/5097-process-split-tender-payments-with-square
- PayU Latam — API Pagos Perú: https://developers.payulatam.com/latam/es/docs/integrations/api-integration/payments-api-peru.html
