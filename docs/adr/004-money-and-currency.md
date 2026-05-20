# ADR-004: Money handling y conversión multi-moneda

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

Manejar dinero en un POS multi-país tiene dos riesgos clásicos:

1. **Errores de precisión**: usar `number` (IEEE-754 float) en JavaScript acumula errores de centavos. Inadmisible para comprobantes fiscales que la SUNAT/SENIAT exige al céntimo.
2. **Conversiones de moneda**: Venezuela opera de facto en VES + USD. Un cliente paga en USD a tasa de un día, recibe vuelto en VES a tasa del mismo día. Si no fijamos la tasa al momento de la venta, hay arbitraje contable.

El schema actual usa `Decimal(14, 2)` para precios (`purchase_price`, `sale_price`, `unit_cost`, etc.). El root CLAUDE.md sin embargo declara `Decimal(15, 4)`. Hay inconsistencia que se resuelve aquí.

No hay tabla de tipos de cambio, no hay Money value object, no hay conversión multi-moneda.

## Decision

### Tipo Decimal estándar

Adoptamos **`Decimal(18, 6)` para almacenamiento interno** de todos los valores monetarios, con presentación al usuario en `(precision_pais, escala_pais)`.

| Tipo | Almacenamiento | Presentación PE | Presentación VE |
|---|---|---|---|
| Precio unitario | `Decimal(18, 6)` | 2 decimales (S/ 12.34) | 2 decimales (Bs 12,34) |
| Total línea | `Decimal(18, 6)` | 2 decimales | 2 decimales |
| Total comprobante | `Decimal(18, 6)` | 2 decimales | 2 decimales |
| Tasa impuesto | `Decimal(7, 4)` | 2 decimales (18.00) | 2 decimales (16.00) |
| Tipo de cambio | `Decimal(18, 6)` | 4 decimales (3.7820) | 6 decimales |

**Razón de precisión 6**: tipos de cambio VES/USD se publican con hasta 6 decimales (BCV). Cálculos intermedios de descuentos compuestos pueden requerir más decimales que la presentación final.

**Razón de redondeo final a 2 decimales**: SUNAT y SENIAT exigen montos al céntimo en el XML.

### Money value object

En backend (TypeScript):

```ts
// shared-kernel/money/money.ts
export class Money {
  private constructor(
    public readonly amount: Decimal,
    public readonly currency: CurrencyCode,
  ) {}

  static of(amount: Decimal.Value, currency: CurrencyCode): Money { ... }
  add(other: Money): Money { /* requires same currency */ }
  subtract(other: Money): Money { ... }
  multiply(factor: Decimal.Value): Money { ... }
  divide(divisor: Decimal.Value): Money { ... }
  convertTo(target: CurrencyCode, rate: ExchangeRate): Money { ... }
  roundToCents(method: RoundingMethod): Money { /* HALF_EVEN por default — Banker's rounding */ }
}
```

Reglas:

- Operaciones entre monedas distintas LANZAN error (`MismatchedCurrencyError`).
- División protege contra cero.
- Redondeo final solo al persistir o presentar — NUNCA en cálculo intermedio.
- `roundingMethod` parametrizable por país (default: `HALF_EVEN` — minimiza sesgo).

### Tabla de tipos de cambio

```
exchange_rates:
  id (uuid)
  tenant_id (uuid, NULL si rate oficial; NOT NULL si rate del tenant)
  base_currency (char 3)
  target_currency (char 3)
  rate (decimal 18,6)
  source ('BCRP', 'BCV', 'manual', 'fixed')
  effective_at (timestamptz)  -- desde cuándo aplica
  expires_at (timestamptz, nullable)
  created_at, created_by
  @@unique([tenant_id, base_currency, target_currency, effective_at])
```

- Worker job diario baja tipo de cambio oficial PE (BCRP) y VE (BCV). Cae a rate `manual` si la API externa falla.
- Tenant en VE puede overridear con su propia tasa (regla de negocio común — paralelo).
- **Toda venta fija la tasa usada en `Sale.exchangeRateSnapshot`** — no se recalcula al re-leer la venta.

### Multi-moneda en una sola venta

Caso Venezuela: cliente paga 50 USD + 20.000 VES.

Modelo:

```
Sale.totalInDocumentCurrency (Decimal 18,6) -- VES en este caso
Sale.documentCurrency (char 3) -- VES (la moneda del comprobante por SENIAT)
Sale.exchangeRates (jsonb) -- snapshot de tasas usadas
Payment.amount (Decimal 18,6)
Payment.currency (char 3)  -- USD o VES
Payment.amountInDocumentCurrency (Decimal 18,6) -- convertido con tasa del momento
```

Suma de `Payment.amountInDocumentCurrency` debe igualar `Sale.totalInDocumentCurrency` o lanzar `PaymentTotalsMismatchError`.

### Validación en frontend

- Inputs monetarios usan `Decimal.js` (no `number`) en frontend para suma/resta antes de enviar.
- Zod schemas validan `.refine(v => Decimal(v).decimalPlaces() <= 2)` para evitar input con más decimales del permitido.
- Currency input siempre es un combo limitado a las monedas activas del país del tenant.

## Consequences

### Positivas

- **Cero errores de precisión** — operaciones sobre Decimal son exactas.
- **Auditoría reproducible**: cada venta tiene el tipo de cambio snapshotteado. Comprobantes antiguos no cambian cuando cambia la tasa.
- **VE multi-moneda real** soportada sin parches.
- **Política de redondeo explícita** y testeable.

### Negativas

- `Decimal.js` y Prisma `Decimal` son objetos, no primitivos. Más boilerplate para serialización/comparación (`.equals()`, `.toString()`).
- `Decimal(18, 6)` ocupa más espacio que `Decimal(14, 2)`. Aceptable.
- Cambiar columnas existentes de `Decimal(14, 2)` a `Decimal(18, 6)` requiere migración cuidadosa (compatible — solo amplía).

### Riesgos abiertos

- BCRP API o BCV API caen → fallback a último rate cacheado (válido por 24h). Después → manual override por tenant.
- Volatilidad VE: si rate cambia 30% en un día y un tenant tiene ventas crédito en USD pendientes → políticas contables del tenant deciden. No es decisión del software, pero el snapshot debe estar para que el contador resuelva.

## Alternatives considered

### A. `number` (float JS)

- **Contras**: precisión inaceptable. Descartado.

### B. Almacenar en **centavos como BigInt**

- **Pros**: simple, exacto.
- **Contras**: las monedas tienen distintas escalas (CLP no tiene centavos, USD sí). Tipo de cambio fraccional rompe el modelo. Descartado para almacenamiento; usado solo internamente si optimizamos.

### C. Una moneda por comprobante (sin multi-moneda en la misma venta)

- **Contras**: forzaría a los clientes VE a hacer dos comprobantes. Mala UX y mala práctica contable. Descartado.

### D. Conversión "live" cada vez que se lee la venta

- **Contras**: comprobante fiscal cambiaría de valor con el tiempo. Inadmisible. Descartado.

## Implementation plan

1. Implementar `Money` value object + tests exhaustivos (Backend Dev, SIS-XX).
2. Migración Prisma `Decimal(14,2) → Decimal(18,6)` para precios y totales (DBA, SIS-XX). Migración aditiva → safe.
3. Tabla `exchange_rates` + worker job de carga diaria (Backend Dev, SIS-XX).
4. Refactor de `calcularImpuestos.util.ts` para usar `Money` (Backend Dev).
5. `Sale.exchangeRateSnapshot` (jsonb) en el modelo de venta cuando se cree (próximo).

## References

- Decimal.js docs: https://mikemcl.github.io/decimal.js/
- BCRP API tipos de cambio: https://www.bcrp.gob.pe/estadisticas/tipo-de-cambio.html
- Martin Fowler, "Money" pattern: https://martinfowler.com/eaaCatalog/money.html
- [[002-multi-country-strategy]]
