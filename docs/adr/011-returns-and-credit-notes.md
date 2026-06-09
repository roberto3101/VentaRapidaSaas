# ADR-011: Devoluciones y notas de crédito

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-51

## Context

Cualquier comercio devuelve. [[005-sale-concurrency]] §Riesgos abiertos dice explícito: "Cancelación de venta: requiere transacción reversa (crear InventoryMovement opuesto + incrementar availableQuantity + emitir NotaCredito). Separado en ADR futuro si crece la complejidad." Aquí está.

Decisiones abiertas:

- **Ventana**: ¿hasta cuándo se acepta devolver? SUNAT permite anular comprobante hasta 7 días; nota de crédito sin límite estricto. Política comercial del tenant ≠ política fiscal.
- **Granularidad**: ¿se devuelve la venta entera o por línea? ¿Mitad de una línea (3 de 5 unidades)?
- **Reembolso**: ¿solo en el método original (efectivo, tarjeta, yape) o en cualquier método? ¿Vale crédito en cuenta?
- **Inventario**: ¿devuelve siempre a stock vendible, o hay una variante "defectuoso/no-vendible"?
- **Arqueo**: una devolución en efectivo afecta el `expectedAmount` del turno actual ([[009-cash-shifts]]).
- **Autorización**: ¿cualquier cajero, o requiere `branch_manager`+?
- **Auditoría**: SUNAT exige nota de crédito referenciando la boleta/factura original con motivo codificado.

Hoy no existe modelo `Refund` ni `CreditNote` propio (existe `nota_credito` como `ReceiptType` en el enum). El módulo `receipts/` emite, pero no hay use case `ReturnSaleUseCase`.

## Decision

### 1. Modelo separado del comprobante

Aunque la **nota de crédito** es un tipo de receipt, la **devolución** es una operación de negocio distinta que produce uno. No mezclar.

```
modules/returns/
├── domain/
│   ├── entities/return.entity.ts
│   ├── value-objects/return-reason.vo.ts
│   └── events/return-completed.event.ts
└── application/
    └── use-cases/{create-return, approve-return, list-returns}.use-case.ts
```

Tablas:

```
returns:
  id (uuid)
  tenant_id, location_id, sale_id (FK)
  return_number (gapless por tenant+location)
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'completed'
  reason_code: 'defective' | 'wrong_item' | 'customer_change_mind' | 'expired' | 'other'
  reason_text (text, opcional)
  created_by_id, approved_by_id, completed_at
  cash_shift_id (FK nullable — solo si afecta efectivo, per ADR-009)
  credit_note_receipt_id (FK al receipt nota_credito emitido)
  refund_method: 'original' | 'cash' | 'store_credit'
  subtotal, tax_amount, total (Decimal 18,6) — montos REVERSADOS

return_items:
  id (uuid)
  return_id (FK)
  sale_item_id (FK al item original)
  quantity (Decimal) — ≤ quantity original menos lo ya devuelto
  unit_price (snapshot del precio en la venta original)
  tax_amount, line_total
  restock: boolean — si vuelve a stock vendible o no
  inventory_location_id (FK) — sucursal donde se restockea (puede ≠ la de venta original si se devuelve en otra)
```

### 2. Ventana de devolución — política dual

| Aspecto | Quién decide | Default |
|---|---|---|
| **Ventana comercial** (¿el negocio acepta devolver?) | Tenant config (`tenant.settings.returnWindowDays`) | 30 días |
| **Anulación comprobante vs nota crédito** | Regla fiscal por país | PE: anulación ≤ 7 días, nota crédito > 7 días |
| **Devolución sin venta original** ("perdí el ticket") | Tenant config (`tenant.settings.allowReturnWithoutReceipt`) | `false` |

Si la devolución está dentro de la ventana comercial:
- **PE, ≤7 días**: emite anulación del comprobante original + restablece stock. NO genera nota de crédito.
- **PE, >7 días**: emite nota de crédito referenciando el comprobante original.
- **VE**: SENIAT requiere nota de crédito en cualquier caso (no permite anulación post-emisión). Emite siempre nota crédito.

La decisión la toma `ReturnPolicyService` (domain service) consultando [[002-multi-country-strategy]] + tenant settings.

### 3. Granularidad — devolución parcial por línea y por unidad

- Una `Return` puede contener un subset de las `SaleItems` originales.
- Cada `ReturnItem.quantity` ≤ `SaleItem.quantity − Σ(returns previas de esa línea)`.
- Si `quantity` es fraccional (vendido por peso, ej. 1.5kg de queso), devolución también puede ser fraccional.
- **No se permite** crear `ReturnItem` con SKU distinto al `SaleItem.productSku`. Cambios de producto se modelan como `Return + nueva Sale`, no como "exchange" directo (mantiene auditoría limpia).

### 4. Reembolso — política por método

| Método original | Default reembolso | Override permitido |
|---|---|---|
| Efectivo | Efectivo | Crédito en cuenta |
| Tarjeta crédito/débito | Reverso a la misma tarjeta (si POS bancario lo soporta) | Crédito en cuenta |
| Yape / Plin / transferencia | Crédito en cuenta (no se devuelve por la app del banco automático) | Efectivo (manager autoriza) |
| Crédito en cuenta del cliente | Crédito en cuenta | — |

**Razones para el default**:
- Efectivo: lo más simple, el cajero entrega billetes de la gaveta.
- Tarjeta: reverso técnico requiere acuerdo con el adquirente (Niubiz, Izipay). Algunos tenants no lo tienen → fallback a crédito en cuenta.
- Yape/Plin: el cliente no quiere recibir un yape devuelto (no se puede), prefiere crédito.

**Crédito en cuenta** (`StoreCredit`) modelado como contraparte:

```
store_credits:
  id, tenant_id, customer_id, location_id (NULL = utilizable en cualquier sede)
  amount, currency, balance (decrementa al usarse)
  origin_return_id (FK)
  expires_at (default: tenant.settings.storeCreditExpiryMonths * 30 días desde creación)
  status: 'active' | 'used' | 'expired' | 'voided'
```

Aplicación: futuro caso de uso `ApplyStoreCreditToSale` (entra en `sales/` cuando exista issue dedicado).

### 5. Inventario — restock condicional

`ReturnItem.restock` decide:

- `restock = true` → `InventoryMovement` de tipo `return_in` que **incrementa** `InventoryStock.quantity` y `availableQuantity` en la `inventory_location_id` indicada (default = sucursal de devolución).
- `restock = false` → `InventoryMovement` de tipo `return_defective` que mueve a una sucursal lógica `defective_<locationId>` (NO contabilizada como vendible). Ese pseudo-stock es para reportes y reclamos al proveedor, no para venta.

El motor de stock respeta el mismo lock pesimista de [[005-sale-concurrency]] cuando hace el restock — la `Return` corre dentro de transacción Serializable, no en outbox.

### 6. Arqueo — impacto en el turno actual

Por [[009-cash-shifts]] `expectedAmount = openingAmount + Σ payments(cash) − Σ cash_movements(out)`.

Decisión: **una devolución con `refund_method = 'cash'` se modela como `CashMovement(type='out', reason='return_<returnId>')`** dentro del turno activo del cajero que la procesa. Esto:

- Refleja la realidad (sale efectivo de la gaveta).
- No requiere campo nuevo en `cash_shifts`.
- Mantiene la fórmula de arqueo intacta.
- Reportes pueden filtrar `CashMovement.reason LIKE 'return_%'` para vista contable de devoluciones del día.

Si NO hay turno activo del cajero → devolución en efectivo bloqueada. Manager autoriza una excepción documentada (raro).

### 7. Autorización por umbral

Mismo patrón que ADR-009:

- `Tenant.settings.returnAmountThreshold` (default S/ 50.00 / equivalente).
- `total ≤ umbral` → cajero ejecuta con permiso `returns:create-low-value` ([[006-auth-and-rbac]]).
- `total > umbral` → requiere `branch_manager`+ con `returns:approve-high-value`.
- Cualquier devolución **fuera de ventana comercial** (excepción del manager) requiere `branch_manager`+ siempre.

Estado `pending_approval` bloquea operaciones siguientes hasta que un manager apruebe/rechace. Notificación push al manager cuando se crea.

### 8. Auditoría y trazabilidad

- Toda `Return` queda en `audit_logs` ([[016-observability]] futuro) con: actor, motivo, montos, timestamp.
- `Receipt` (nota crédito) **siempre** referencia al `Receipt` original (`previousReceiptId`).
- El motivo codificado (`reason_code`) es obligatorio — texto libre opcional.
- Reporte fiscal "Notas de crédito del periodo" sale de `Receipt.type = 'nota_credito'`.

## Consequences

- ✅ Modelo limpio: devolución (operación) y nota de crédito (comprobante) están separados — refleja la realidad legal y operativa.
- ✅ Partial returns + multi-método refund cubren casos reales sin parches.
- ✅ Impacto en arqueo via `CashMovement` mantiene una sola fórmula en ADR-009.
- ✅ Store credit prepara terreno para fidelización sin nuevo dominio masivo.
- ⚠️ Reverso real a tarjeta depende del adapter del adquirente (Niubiz, Izipay). MVP usa fallback a crédito en cuenta + nota manual; reverso técnico entra en fase 3.
- ⚠️ Devolución en sucursal distinta de la venta original requiere transferencia contable interna entre sucursales — modelado pero no UI en MVP.
- 🔓 Riesgo abierto: fraude por devoluciones repetidas del mismo cliente. Mitigación fase 2: heurísticas (alerta si cliente X tiene >3 devoluciones en 30 días).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Devolución = "venta negativa" (mismo modelo Sale con quantity negativa) | Confunde reportería, rompe invariantes de Sale (cant > 0), mala UX para contador. |
| B. Una sola tabla `transactions` polimórfica para venta+devolución | Anti-pattern. Pierde claridad de intent. |
| C. Restock siempre (sin opción defective) | No refleja la realidad: producto vencido / dañado no vuelve a góndola. |
| D. Sin store credit (solo efectivo o tarjeta) | Mala UX en métodos digitales (yape no devuelve). Genera fricción innecesaria. |
| E. Anulación SIEMPRE en PE (no nota de crédito) | SUNAT prohíbe anular >7 días. Ilegal. |

## Implementation plan

1. Tablas `returns`, `return_items`, `store_credits` (DBA, SIS-XX). FK aditivos sin breaking change.
2. `modules/returns/` con use cases `CreateReturn`, `ApproveReturn` (Backend Dev).
3. `ReturnPolicyService` que decide anulación vs nota crédito por país + ventana (Backend Dev).
4. Integración con `modules/cash/` para emitir `CashMovement` automático (Backend Dev).
5. Integración con `modules/receipts/` para emitir nota crédito vía `IFiscalEmitter` ([[003-fiscal-emission-hexagonal]]).
6. UI: pantalla "Buscar venta → seleccionar líneas → motivo → confirmar" (Frontend Dev).
7. Tests: devolución parcial, devolución con cash sin turno, refund tarjeta fallback a store credit, ventana excedida bloqueada, aprobación high-value (QA).

## References

- [[002-multi-country-strategy]] · [[003-fiscal-emission-hexagonal]] · [[005-sale-concurrency]] · [[006-auth-and-rbac]] · [[009-cash-shifts]]
- SUNAT — Anulación vs Nota de Crédito: https://cpe.sunat.gob.pe/
