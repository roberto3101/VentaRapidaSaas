# ADR-017: Venta Rápida — flujo unificado de checkout

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-57

## Context

El núcleo del producto es **la pantalla del POS**. Una bodeguera, un minimarket o un mayorista en LATAM no usan tres pantallas distintas según el tipo de cobro o de comprobante — necesitan **una sola pantalla** que cubra:

- Escanear/buscar productos (físicos por SKU, granel por peso, servicios sin stock).
- Sumar líneas al carrito sin clicks innecesarios.
- Cobrar en cualquier método o **combinación de métodos** (split tender).
- Emitir el comprobante correcto según el cliente (boleta para persona, factura para empresa, ticket interno si <S/5 facultativo per [SUNAT — Reglamento de Comprobantes de Pago](https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf)).
- Imprimir / enviar el comprobante.
- Cerrar y empezar la siguiente venta — sin cambiar de pantalla.

Hoy el repo tiene `frontend/app/(dashboard)/pos/page.tsx` con WIP (componentes sueltos `linea-carrito`, `escaner-input`, `dialog-pago`) y backend `modules/ventas/` + `modules/comprobantes/` separados. Nada unifica el flujo. Decisiones abiertas:

- **Una pantalla vs varias**: ¿el cajero hace boleta en una pantalla y factura en otra?
- **Carrito polimórfico**: ¿el carrito sabe vender productos + servicios + bundles + granel desde el primer día?
- **Ordering**: ¿el comprobante se elige al inicio (antes de escanear) o al final (antes de cobrar)?
- **Múltiples métodos de pago**: ¿modelo nativo desde MVP o se difiere?
- **Atajos teclado**: Shopify POS define un set estándar ([Shopify Help — Keyboard shortcuts POS](https://help.shopify.com/en/manual/sell-in-person/getting-started/keyboard-shortcuts)) — ¿adoptamos?
- **Tipo de cliente**: ¿se captura cliente antes o después del cobro?
- **Devolución / nota de crédito**: ¿desde la misma pantalla o panel aparte?

## Decision

### 1. Una sola pantalla **PosCheckout** — todo confluye aquí

```
/pos                  → PosCheckoutPage (la única pantalla operativa del cajero)
/pos/shift            → modal de abrir/cerrar turno (overlay)
/pos/search           → drawer de búsqueda avanzada (overlay)
/pos/customer         → drawer de cliente (overlay)
/pos/payment          → modal de pago (overlay)
/pos/return           → modal de devolución (overlay, busca venta original)
```

Todo navega como overlays sobre la misma página. **Sin recargar nunca** durante el turno. Patrón inspirado en [Shopify POS UI](https://www.shopify.com/blog/pos-ui) — "el POS es una superficie, no un sitio web".

### 2. Carrito polimórfico — `CartItem` cubre todos los casos

```ts
type CartItem =
  | { kind: 'product';    variantId; sku; name; qty: Decimal; unitPrice: Money; taxRate; discount?; notes?  }
  | { kind: 'service';    serviceId; name; qty: Decimal; unitPrice: Money; taxRate; discount? }
  | { kind: 'weighted';   variantId; sku; name; weightKg: Decimal; pricePerKg: Money; taxRate; }
  | { kind: 'bundle';     bundleId; name; components: CartItem[]; bundlePrice: Money; }
  | { kind: 'manual';     name; qty; unitPrice: Money; taxRate; note: string; }  // venta sin SKU (ej. "envoltura S/2")
```

Reglas:

- **Una sola tabla `sale_items`** en BD — el `kind` se persiste como columna discriminadora, los campos opcionales como nullable. Esto evita JOINs polimórficos y mantiene `sales/` simple.
- **Validaciones por kind**: el use case `AddItemToCart` valida según `kind` (stock para product/weighted, no para service/manual; bundle expande componentes para descuento de stock).
- **Bundle**: componentes se desglosan al persistir, pero **el cliente ve una sola línea** con el nombre del bundle (UX). El XML SUNAT desglosa los componentes (per UBL 2.1 reglas de items).

### 3. Ordering del flujo — **comprobante se elige al final**, no al inicio

Razón: el cajero NO debería decidir "boleta o factura" antes de escanear nada. Lo decide cuando el cliente declara su documento (o no declara — bodega lo más común).

Flujo:

```
1. Escanear / buscar productos    → carrito crece
2. (opcional) Agregar cliente     → si tiene RUC, default = factura; sino default = boleta
3. (opcional) Aplicar descuento   → línea o global
4. F8 Cobrar                      → modal de pago
5. Elegir método(s) de pago        → split tender soportado (per [Square — Split Payment](https://developer.squareup.com/docs/payments/scenarios/split-online-payment))
6. Confirmar pago                  → backend ejecuta transacción atómica (per ADR-005)
7. Comprobante se emite            → outbox + Greenter (per [[003]] + [[012]])
8. Imprimir + cliente sale         → carrito se resetea, foco vuelve al escáner
```

**Tiempo objetivo end-to-end** para venta típica (3 ítems escaneados, efectivo, sin cliente): **<8 segundos** desde primer scan hasta "siguiente cliente".

### 4. Búsqueda unificada — un solo input, múltiples fuentes

`PosSearchInput` (siempre focused, top-left) acepta:

- **Código de barras** (escaneado o tecleado) — exact match contra `product_variants.sku` o `barcode`.
- **Código corto** del tenant — ej. `001` para "Inca Kola 500ml", configurable.
- **Nombre parcial** — full-text search (Postgres `tsvector` con `unaccent`), top 10 sugerencias.
- **Comando**: `/cliente RUC` busca cliente; `/venta NUM` abre venta pasada; `/return` abre devolución.

Algoritmo de resolución (en orden):

1. Si la entrada termina con `Enter` y matchea SKU/barcode exacto → agrega al carrito sin sugerencias (caso escáner).
2. Si matchea `/comando` → ejecuta acción.
3. Sino → muestra dropdown de sugerencias (productos + clientes + ventas pasadas).
4. Si solo hay 1 sugerencia y el usuario presiona `Tab` → selección rápida.

Backend: endpoint `GET /api/v1/pos/search?q=...&locationId=...` con cache TanStack 5min ([[010-frontend-architecture]]).

### 5. Multi-pago en una venta — split tender nativo

El modal de pago muestra:

- **Total a pagar** (grande)
- **Métodos disponibles del tenant** (chips: Efectivo, Yape, Plin, Tarjeta, Transferencia, Crédito en cuenta — los que el `tenant.settings.enabledPaymentMethods` permita)
- **Líneas de pago agregadas** (lista, sumando hacia el total)
- **Restante** (resaltado si > 0, verde si = 0, "vuelto" si < 0 y método = efectivo)

Click en un método → diálogo de monto (default: restante completo). Validación:

- Suma de payments NO puede exceder total **excepto en efectivo** (genera vuelto).
- Métodos digitales (Yape/Plin/Tarjeta) requieren monto exacto al `restante` (no "yapean S/100 de S/87").
- **Split** real: ej. S/50 efectivo + S/37 Yape + S/13 crédito en cuenta — tres `Payment` rows ligados al mismo `Sale`.
- Detalle del modelado de pagos en **[[018-payments-unified]]** — TODOS los métodos viven en `modules/payments/` con strategy pattern, jamás `sales/` importa Yape/Culqi directo.

### 6. Selección del comprobante — automática + override manual

Algoritmo al momento de cobrar (paso 7 del flujo):

```
if (carrito.cliente?.docType === 'RUC')  → default 'factura'
else if (carrito.cliente?.docType === 'DNI' || 'CE') → default 'boleta'
else if (carrito.total < tenant.settings.facultativeReceiptThreshold) → default 'ticket_interno'
else → default 'boleta'
```

`facultativeReceiptThreshold` default S/5 (per [SUNAT — Reglamento Comprobantes](https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf) art. 7: facultativo bajo S/5 al consumidor final).

**Override manual** siempre disponible (dropdown en el modal de pago). Cambio de tipo a `factura` deshabilita el confirmar si no hay RUC válido.

### 7. Atajos teclado obligatorios (alineados con [Shopify POS](https://help.shopify.com/en/manual/sell-in-person/getting-started/keyboard-shortcuts) cuando aplica)

| Tecla | Acción |
|---|---|
| `F2` | Abrir cliente (search/crear) |
| `F3` | Aplicar descuento línea actual |
| `F4` | Aplicar descuento global |
| `F5` | Cambiar tipo comprobante (boleta ↔ factura ↔ ticket) |
| `F6` | Agregar nota a línea |
| `F7` | Eliminar línea actual |
| `F8` | **Cobrar** (abrir modal de pago) |
| `F9` | Anular última línea agregada |
| `F10` | Pausar venta (guardar carro para retomar) |
| `F12` | Cambiar de cajero (cerrar turno propio, abrir nuevo) |
| `ESC` | Cerrar modal/drawer activo |
| `Ctrl+Enter` (en modal pago) | Confirmar pago |
| `Ctrl+Z` (en carrito) | Undo última acción |
| `↑/↓` (en carrito) | Navegar líneas |
| `+/-` (en línea) | Aumentar/disminuir cantidad |

Atajos visibles en barra inferior fija (`PosShortcutsBar`).

### 8. Modo "Venta Rápida 1-tap" — bodega que solo vende efectivo

Tenant config `tenant.settings.fastSaleMode = true` habilita modo simplificado:

- Default: comprobante `ticket_interno` si <S/5, `boleta sin cliente` si >=S/5.
- Default: pago efectivo, modal de pago **NO se abre** — `F8` pregunta directo "Monto entregado:" y muestra vuelto.
- `Ctrl+F8` salta incluso eso y asume "exact change".
- Cliente NO se captura.
- Tiempo objetivo: **<3 segundos** desde último scan a cliente afuera.

Esto cubre el caso 80%/20% bodega. Mayorista / minimarket lo desactivan.

### 9. Transaccionalidad — toda venta es atómica

[[005-sale-concurrency]] ya lo decidió: una transacción Postgres `Serializable` por venta cubre:

1. Verificar idempotencia (`idempotency_keys`).
2. Lock pesimista sobre `inventory_stock` de las variantes vendidas.
3. Crear `Sale` + `SaleItems` + `Payments`.
4. Decrementar stock.
5. Crear `OutboxEvent` para emisión fiscal asíncrona.
6. Persistir `idempotency_key` con snapshot.

**Esto se mantiene tal cual.** La pantalla `PosCheckout` envía **UN solo `POST /api/v1/pos/sales`** con el carrito completo + payments. El backend hace TODA la transacción atómica. Si falla en cualquier punto → rollback total, el cajero ve error claro y nada cambió.

**Pagos asincrónicos** (Yape OTP, Tarjeta 3DS): el `Payment` se persiste con `status='pending'` dentro de la transacción. El webhook ([[021-webhook-security]]) confirma a `status='captured'` después. **La venta se considera completada cuando todos los `Payment` están `captured`** — la emisión fiscal espera hasta ese momento (outbox condicional).

### 10. Devolución desde el mismo POS

`F11` o `/return` abre `PosReturnDrawer`:

1. Buscar venta original (por SaleNumber o seleccionar de últimas 30).
2. Marcar líneas a devolver + cantidad.
3. Motivo (dropdown según [[011-returns-and-credit-notes]]).
4. Método de reembolso (default: original).
5. Confirmar → backend ejecuta transacción reverse atómica.

**No se sale del POS.** El cajero puede volver a vender después de devolución en 5 segundos.

## Consequences

- ✅ Una sola pantalla minimiza training y errores. Cajero nuevo opera en 30 minutos.
- ✅ Carrito polimórfico cubre todos los casos (producto, servicio, granel, bundle, manual) con un solo modelo.
- ✅ Multi-pago nativo desde MVP — no hay "retrofit" doloroso después.
- ✅ Atajos teclado replican estándar de industria — cajero que viene de otro POS no se desorienta.
- ✅ Modo Venta Rápida cierra el caso bodega (mercado más grande) con UX óptima.
- ✅ Devolución integrada — no hay que cambiar de pantalla, máxima velocidad.
- ✅ Atomicidad real en BD — venta nunca queda a medias.
- ⚠️ Carrito polimórfico requiere disciplina en validaciones por `kind`. Tests obligatorios.
- ⚠️ Pagos asincrónicos (Yape, tarjeta) introducen estado intermedio `pending`. UX debe ser clara ("Esperando confirmación Yape...").
- 🔓 Riesgo abierto: tenant con plan que NO permite ciertos métodos de pago — UI debe filtrar antes, no esperar al backend. Enforcement en `usePaymentMethods()` hook.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Pantalla separada por tipo de comprobante (boleta vs factura) | UX peor, código duplicado. Una sola pantalla con override final cubre ambos. |
| B. Carrito tipado solo para productos físicos | No cubre servicios ni granel. Refactor doloroso después. |
| C. Cliente obligatorio al inicio | Fricción enorme para bodega — 90% de ventas no tienen cliente identificado. |
| D. Comprobante elegido al inicio | Cajero olvida cambiarlo y emite mal. Mejor decidir cuando ya hay cliente. |
| E. Sin atajos teclado | El cajero pierde 3-5 segundos por venta usando mouse. Inaceptable a 100 ventas/día. |
| F. Multi-pago en fase 2 | Es feature crítica desde MVP — cualquier minimarket lo necesita (efectivo + tarjeta + yape mezclado). |
| G. Modo Venta Rápida como app aparte | Confunde la oferta. Es un toggle dentro del POS. |

## Implementation plan

1. Refactor de `frontend/app/(dashboard)/pos/page.tsx` → `PosCheckoutPage` con overlays (Frontend Dev, SIS-XX).
2. `PosSearchInput` con resolución unificada + dropdown sugerencias (Frontend Dev).
3. `CartStore` (Zustand persist) con `CartItem` polimórfico + validaciones por kind (Frontend Dev).
4. `PaymentModal` con split tender + integración a `modules/payments/` ([[018]]) (Frontend Dev + Backend Dev).
5. Endpoint `POST /api/v1/pos/sales` con transacción atómica completa (Backend Dev, depende de [[005]] base).
6. `PosShortcutsBar` + handlers de teclas (Frontend Dev).
7. Toggle `fastSaleMode` en settings + comportamiento condicional (Backend + Frontend).
8. `PosReturnDrawer` integrado, sin salir del POS (Frontend + Backend per [[011]]).
9. Tests E2E Playwright: venta 3 items efectivo <8s; split tender 3 métodos; modo rápido <3s; devolución parcial (QA).

## References

- [[003-fiscal-emission-hexagonal]] · [[005-sale-concurrency]] · [[009-cash-shifts]] · [[010-frontend-architecture]] · [[011-returns-and-credit-notes]] · [[012-sunat-production-hardening]] · [[018-payments-unified]] · [[019-pos-hardware]] · [[021-webhook-security]]
- Shopify POS UI principles: https://www.shopify.com/blog/pos-ui
- Shopify POS keyboard shortcuts: https://help.shopify.com/en/manual/sell-in-person/getting-started/keyboard-shortcuts
- Shopify Checkout UX best practices 2026: https://cartylabs.com/blog/shopify-checkout-ux-best-practices/
- Square split payment scenarios: https://developer.squareup.com/docs/payments/scenarios/split-online-payment
- Loyverse POS features: https://loyverse.com/features
- SUNAT Reglamento Comprobantes de Pago: https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf
- SUNAT Boleta Electrónica: https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta
- Mobile checkout UX tips 2025: https://developerux.com/2025/07/30/10-mobile-checkout-ux-tips-for-2025/
