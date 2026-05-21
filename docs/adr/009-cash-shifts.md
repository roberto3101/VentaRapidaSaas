# ADR-009: Turnos de caja y arqueo

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect
- **Issue**: SIS-49

## Context

Un cajero abre turno al iniciar jornada, vende, y al cerrar concilia efectivo en gaveta vs registrado. Decisiones abiertas: granularidad del turno, qué hacer si el operador cierra sesión sin cerrar, quién autoriza diferencias, cómo se concilian pagos no-efectivo, y dónde vive el bounded context.

Hoy `Sale` referencia `cashierId` y `locationId` ([[005-sale-concurrency]]) pero no existe modelo `CashShift`. Sin turno, no hay forma de cuadrar caja ni imputar diferencias.

## Decision

### Granularidad — 1 turno activo por `(userId, locationId)`

- No modelamos `CashRegister` físico en MVP: 80% del mercado (bodega) tiene 1 PC por sede; minimarkets rotan cajeros entre PCs. Un cajero solo puede tener **1 turno abierto a la vez** por sede.
- Tabla `CashShift { id, tenantId, locationId, userId, openedAt, openingAmount, closedAt?, expectedAmount?, actualAmount?, difference?, status, closedById?, approvedById? }`.
- `Sale` y `Payment(cash)` guardan `cashShiftId` (FK nullable durante backfill, luego `NOT NULL` aditivo).
- Multi-caja física entra en fase 2 agregando `CashRegister` + `CashShift.cashRegisterId` sin breaking change.

### Auto-cierre nocturno con flag (NO en logout)

- Logout NO cierra turno: el efectivo físico sigue en gaveta.
- Job nocturno (03:00 hora tenant) cierra turnos abiertos del día anterior con `status='auto_closed'`, `expectedAmount` calculado y `actualAmount=NULL`. Emite `CashShiftAutoClosed` que notifica al `branch_manager`.
- Manager debe entrar al día siguiente, declarar `actualAmount` real y aprobar → pasa a `status='reconciled'`.

### Aprobación de diferencias por umbral

- `Tenant.settings.cashShiftDiffThreshold` (default S/ 5.00).
- `|difference| ≤ umbral` → cajero cierra con permiso `shifts:close-own` ([[006-auth-and-rbac]]).
- `|difference| > umbral` → requiere `branch_manager`+ con `shifts:approve-diff`. Sin aprobación queda `pending_approval` y **bloquea apertura** de nuevo turno del mismo usuario en esa sede.

### Solo efectivo entra al arqueo

- `expectedAmount = openingAmount + Σ payments(method='cash') − Σ cash_movements(out)`.
- Tarjeta, transferencia, yape, plin **NO** entran al arqueo físico — se concilian contra voucher del adquirente en `reports/` (T+1, fuera de este ADR).
- Devoluciones cash (`NotaCredito` con reembolso) descuentan del `expectedAmount`.
- `CashMovement { shiftId, type:'in'|'out', amount, reason, authorizedById }` para retiros a banco / inyección de cambio.

### Bounded context propio `modules/cash/`

- Separado de `sales/` por reglas propias (apertura/cierre, aprobaciones, arqueo) y comunicación vía bus, no import directo ([[008-clean-architecture-layers]]).
- Escucha `SaleCompleted` para proyectar `expectedAmount` en tiempo real.
- Expone port `ICashShiftReader` que `sales/` consulta antes de `createSale` ("¿hay turno abierto?").

## Consequences

- ✅ Modelo simple para bodega, escalable a minimarket multi-cajero, extensible a multi-caja física sin breaking change.
- ✅ Arqueo solo-efectivo refleja la realidad: el manager cuenta billetes, no concilia Visa.
- ✅ Auto-cierre evita turnos huérfanos eternos sin perder trazabilidad (`actualAmount=NULL` señala "no contado").
- ⚠️ Cajero que olvida cerrar bloquea su próxima jornada hasta aprobación del manager (mitigación: notificación push).
- ⚠️ `cashShiftId` en `Sale` exige migración aditiva con backfill (turno sintético "legacy" por sede).
- 🔓 Riesgo abierto — **multi-moneda en una sede** (Venezuela bimonetario USD+VES): arqueo debe partirse por `currencyCode`. Pendiente ADR-010.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Turno por caja física (`CashRegister`) en MVP | Overkill para bodega (80% del mercado). Se suma en fase 2 sin breaking change. |
| B. Turno solo por `userId` (sin sede) | Rompe cajero que rota entre sucursales (mayoristas). |
| C. Arqueo multi-método (cash + voucher + yape) en una pantalla | Voucher tarjeta llega T+1 desde el adquirente; mezclar genera falsos positivos. |
| D. Cajas dentro de `sales/` | Viola SRP del bounded context. Reportería contable y aprobaciones no son ventas. |

## Implementation plan

1. Tablas `cash_shifts` + `cash_movements` + FK nullable `sales.cash_shift_id` (DBA).
2. `modules/cash/` con use cases `OpenShift`, `CloseShift`, `ApproveShiftDiff`, `RegisterCashMovement` (Backend Dev).
3. Guard que valida turno abierto antes de `createSale` vía `ICashShiftReader` (Backend Dev).
4. Cron `auto-close-stale-shifts` (BullMQ).
5. UI apertura/cierre/arqueo en `features/cash/` (Frontend Dev, issue aparte).
6. Tests: diff bajo umbral, diff alto, auto-cierre, doble apertura bloqueada (QA).

## References

- [[005-sale-concurrency]] · [[006-auth-and-rbac]] · [[008-clean-architecture-layers]]
