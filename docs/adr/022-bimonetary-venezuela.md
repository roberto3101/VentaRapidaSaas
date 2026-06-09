# ADR-022: Sede bimonetaria — operación VES + USD en Venezuela

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-62

## Context

[[009-cash-shifts]] dejó como riesgo abierto: "multi-moneda en una sede (Venezuela bimonetario USD+VES): arqueo debe partirse por `currencyCode`. Pendiente ADR-022."

[[004-money-and-currency]] resolvió **almacenamiento** y **conversión** (`Decimal(18,6)` + `Money` VO + tabla `exchange_rates` + snapshot por venta). Lo que NO cubrió es la **operación diaria en la caja**:

- Cliente entra y paga **20 USD + 50000 VES** por una compra de 100 USD (a tasa del día = total VES).
- Cajero entrega vuelto: ¿en USD o en VES? ¿A qué tasa?
- Al cierre del turno: ¿arqueo en USD, en VES, o en ambos?
- Reportes diarios: ¿total ventas en qué moneda?
- Comprobante SENIAT: la **moneda funcional** del comprobante es VES por ley, pero la operación real es bimonetaria.

Realidad VE 2026: el dólar circula libremente y es preferido por valor ([Inside PayTech — Venezuela bimonetario](https://www.insidepaytech.com/noticias/...) — varias fuentes coinciden). El **bolívar sigue siendo moneda funcional legal** para SENIAT.

Sin esta ADR, una bodega en Caracas no puede operar el sistema porque cada venta es mixta.

## Decision

### 1. Modelo de monedas en la sede

`Location` (tabla `locations`) extiende:

```
locations:
  ...
  functional_currency (char 3, NOT NULL)        -- moneda contable y de comprobantes (VE → VES, PE → PEN)
  accepted_currencies (char 3 array NOT NULL)   -- monedas en que se puede cobrar/devolver (VE típico → ['VES','USD'])
  default_change_currency (char 3 NULL)         -- moneda preferida para dar vuelto (puede ser distinta a functional)
```

Por país:

| País | functional_currency | accepted_currencies | default_change |
|---|---|---|---|
| PE | PEN | ['PEN'] | PEN |
| VE | VES | ['VES', 'USD'] | VES |
| Futuro EC | USD | ['USD'] | USD |
| Futuro CO | COP | ['COP', 'USD'] | COP |

Tenant configurable: una bodega en Caracas que NO acepta USD pone `['VES']`; un negocio turístico que acepta solo USD pone `['USD']`.

### 2. Snapshot de tasas POR VENTA — extendido

[[004-money-and-currency]] ya define `Sale.exchangeRateSnapshot (jsonb)`. Lo concretamos:

```ts
sale.exchangeRateSnapshot = {
  base: 'VES',                       // moneda funcional del comprobante
  rates: {
    'USD->VES': '37.1234',           // tasa al momento exacto de la venta
    'VES->USD': '0.026938'           // recíproco (computado para facilitar reportes)
  },
  source: 'BCV',                     // 'BCV' | 'manual' | 'cache'
  timestamp: '2026-05-21T14:23:15Z'
}
```

Si la API del BCV falla, fallback a último rate cacheado (válido por 24h per [[004]]). Tras 24h sin update, el cajero ve banner rojo "Tipo de cambio desactualizado, contacta admin" y solo puede cobrar en `functional_currency`.

### 3. Multi-pago en monedas distintas — extensión de [[018-payments-unified]]

[[018]] ya define `Payment.currency` y `Payment.amount_in_document_currency`. Para VE bimonetario el flujo concreto:

```ts
// Venta de S/total = 100 USD equivalente; functional_currency = VES; rate USD/VES = 37.12
// Cliente paga: 20 USD + 50000 VES

const sale = {
  documentCurrency: 'VES',
  total: 3712,             // 100 USD × 37.12
};

const payments = [
  { method: 'cash', currency: 'USD', amount: 20, amountInDocCurrency: 742.4 },
  { method: 'cash', currency: 'VES', amount: 50000, amountInDocCurrency: 50000 },
];

// Validación: sum(amountInDocCurrency) debe igualar total ± epsilon (0.01 VES)
// 742.4 + 50000 = 50742.4 → restante = -47030.4 → vuelto

// Política de vuelto:
// 1. Si default_change_currency = 'VES' → entrega 47030.4 VES
// 2. Si cajero hace override y elige USD → 47030.4 / 37.12 = 1267.04 USD
// El cajero selecciona en UI antes de confirmar.
```

UI POS modal de pago (per [[017]] §5):

- Cada chip de método **pregunta moneda** si la sede tiene >1 `accepted_currency`.
- Después del monto, muestra equivalente en moneda funcional (informativo).
- "Restante" se muestra en TODAS las accepted_currencies con tasa actual.
- "Vuelto" se muestra en `default_change_currency`, cajero puede cambiar con dropdown.

### 4. Arqueo de turno — partido por currency

[[009-cash-shifts]] dice "solo efectivo entra al arqueo". Para sede bimonetaria, **el turno tiene un arqueo por currency aceptada**.

Schema extendido:

```
cash_shifts:
  ...
  -- en lugar de campos escalares:
  -- opening_amounts (jsonb)        — {VES: '500000', USD: '50'}
  -- expected_amounts (jsonb)       — computado al cierre
  -- actual_amounts (jsonb)         — declarado por cajero
  -- differences (jsonb)            — actual - expected
```

O alternativa **normalizada** (preferida por queries y reportes):

```
cash_shift_balances:
  id, cash_shift_id (FK), currency_code (char 3)
  opening_amount (Decimal 18,6)
  expected_amount (Decimal 18,6 nullable)
  actual_amount (Decimal 18,6 nullable)
  difference (Decimal 18,6 nullable)
  approval_status: 'auto' | 'pending_approval' | 'approved' | 'rejected'
  approved_by_id (FK nullable)

  @@unique([cash_shift_id, currency_code])
```

Al abrir turno, cajero declara `opening_amount` para CADA currency aceptada (default 0 si no aplica). Durante el turno, cada `Payment(method=cash)` se proyecta a su currency. Al cierre, cajero declara `actual_amount` por currency, sistema computa diferencias **independientes**.

### 5. Aprobación de diferencias — por currency

[[009]] §Aprobación dice `|difference| ≤ umbral` cajero cierra, sino requiere manager. Extensión:

- `tenant.settings.cashShiftDiffThreshold` se vuelve un objeto:
  ```
  { VES: '5000', USD: '5.00' }
  ```
- Umbral por currency (USD 5 dolares ≠ VES 5 bolívares).
- Si **cualquier** currency excede su umbral → todo el turno queda `pending_approval`.
- Manager aprueba/rechaza el turno **completo**, no por currency individual.

### 6. Reportes — consolidación a moneda funcional

Reportes diarios/mensuales muestran:

- **Vista nativa** (default): cada cantidad en su currency original. Ej. "Ventas hoy: 800 USD + 25M VES".
- **Vista consolidada** (toggle): todo convertido a `functional_currency` con tasa del momento de cada venta (no recálculo con tasa actual). Ej. "Ventas hoy: 32.7M VES".

La conversión usa `Sale.exchangeRateSnapshot` de cada venta, garantizando reproducibilidad histórica.

### 7. Comprobante SENIAT — moneda funcional + nota informativa

Por regulación SENIAT, el comprobante (factura única VE) se emite en **VES** (moneda funcional). Pero el cliente recibió un comprobante donde quiere ver "yo pagué 20 USD".

Solución:
- XML SENIAT: todos los montos en VES (legal).
- Comprobante impreso / PDF: aparte de los montos en VES, **bloque informativo** al pie con los pagos en su currency original y la tasa usada:

```
TOTAL:                        Bs. 3,712.00

DETALLE DE PAGO:
  Efectivo USD     20.00     →  Bs.   742.40   (tasa: 37.12)
  Efectivo VES   50,000.00   →  Bs. 50,000.00
  Vuelto VES     47,030.40   →  Bs. 47,030.40

Tasa de cambio: BCV 21/05/2026
```

Esto **no es** parte del XML legal (que solo lleva VES), es un add-on visual del template ESC/POS ([[019-pos-hardware]] §3).

### 8. Devoluciones — misma currency que el cobro original

[[011-returns-and-credit-notes]] establece reembolso "default = método original". Para bimonetario:

- Devolución en efectivo del Payment original en USD → reembolso en USD (toma del cajón USD).
- Si no hay USD suficiente en gaveta → manager autoriza pagar en VES a tasa **actual** (no la original) + documenta razón. Auditado.
- Tasa actual ≠ tasa original es riesgo asumido por el negocio (típico en VE).

### 9. Tenant onboarding — selección al crear sede

Cuando se crea una `Location` con tenant `countryCode = 'VE'`:

- Wizard ofrece checkbox "Esta sede acepta USD además de VES" (default ✅).
- Si check → `accepted_currencies = ['VES', 'USD']`.
- Si uncheck → `accepted_currencies = ['VES']` (operación pura VES).
- `default_change_currency` editable post-creación.

### 10. Migración de la sede pre-bimonetario

Sedes existentes con `accepted_currencies` sin definir → migración aditiva con default = `[functional_currency]`. Tenants VE deben ir a settings y activar USD si lo necesitan (notificación tras deploy).

### 11. Transaccionalidad

- Modificación de `cash_shift_balances` siempre dentro de la misma transacción que crea/actualiza `Payment(method=cash)`. **Atomicidad obligatoria** — si la transacción falla, ni el Payment ni el balance change persisten.
- Aprobación de diferencias `pending_approval → approved` también transaccional.

## Consequences

- ✅ Cubre el caso VE real (bimonetario) sin parches en código de venta.
- ✅ Reportes nativos y consolidados, ambos correctos contablemente.
- ✅ Arqueo independiente por currency — cajero cuenta dólares y bolívares separados (como hace en la realidad).
- ✅ Cuando llegue EC (USD pura) o CO (COP+USD turístico) — mismo modelo aplica con `accepted_currencies = ['USD']` o `['COP','USD']`.
- ✅ Comprobante SENIAT en VES (legal) + bloque informativo en currency original (UX).
- ⚠️ Schema `cash_shift_balances` reemplaza columnas escalares de `cash_shifts` — migración con backfill (cada turno PE existente recibe 1 row VES por currency).
- ⚠️ UI POS más cargada en VE: cada método pregunta currency. PE no se ve afectado (1 sola currency).
- 🔓 Riesgo abierto: cliente que paga 20 USD y exige vuelto en USD pequeños — gaveta puede no tener cambio chico. UX: pedir al cajero declarar la mezcla disponible al abrir turno.
- 🔓 Riesgo abierto: volatilidad VES intra-día. Mitigación: ya cubierta por snapshot por venta (la venta de las 10:00 no cambia si la tasa cambia a las 15:00).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Todo en VES, USD como "equivalente informativo" pre-cobro | No refleja la realidad: el cajero recibe billetes USD físicos. El arqueo SÍ tiene que ser por currency. |
| B. Dos sistemas separados (sede USD + sede VES) | Burocracia operacional. Una sola sede con dos cajones es la realidad. |
| C. Currency single por venta (cliente paga TODO en USD o TODO en VES) | Realidad VE: la mayoría son split. Forzar single = mala UX, posible incumplimiento. |
| D. Tasa del día (no del momento de venta) | Si pasa el día y la tasa cambia, reportes intra-día se desvirtúan. Momento-de-venta es correcto. |
| E. Recalcular comprobantes a tasa actual al re-imprimir | Ilegal — el comprobante SENIAT es inmutable. |
| F. Solo VES en sede VE (ignorar USD) | Pierde caso de uso real masivo. Sale de mercado. |

## Implementation plan

1. Schema: extender `locations` (functional_currency, accepted_currencies, default_change_currency); tabla `cash_shift_balances`; migración con backfill (DBA, SIS-XX).
2. Actualizar `OpenShiftUseCase` para crear N balances (1 por currency) (Backend Dev).
3. Actualizar `CloseShiftUseCase` para computar expected_amount por currency, validar threshold por currency (Backend Dev).
4. Actualizar `CreateSaleUseCase` y `CreateReturnUseCase` para proyectar Payment cash a balance correspondiente (Backend Dev).
5. UI POS: modal de pago en sede multi-currency con selector de moneda por línea (Frontend Dev per [[017]]).
6. UI arqueo: vista de cierre con N tablas (una por currency) (Frontend Dev).
7. Template ESC/POS con bloque informativo de payments en currency original (Backend Dev per [[019]]).
8. Reportes vista nativa vs consolidada (Backend + Frontend).
9. Tests: venta bimonetaria split, vuelto override, arqueo multi-currency con threshold violado, devolución en USD escaso → manager fallback (QA).

## References

- [[002-multi-country-strategy]] · [[004-money-and-currency]] · [[009-cash-shifts]] · [[011-returns-and-credit-notes]] · [[015-tenant-onboarding]] · [[017-fast-checkout-unified]] · [[018-payments-unified]] · [[019-pos-hardware]]
- BCV (Banco Central de Venezuela) — tipos de cambio: https://www.bcv.org.ve/
- SENIAT (Servicio Nacional Integrado de Administración Aduanera y Tributaria): http://www.seniat.gob.ve/
- Decimal.js: https://mikemcl.github.io/decimal.js/
