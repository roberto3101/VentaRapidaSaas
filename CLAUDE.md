# CLAUDE.md — SistemaVentaRapida Pro · Contexto global

> Este archivo es el primer contexto que cualquier agente (humano o IA) debe leer al entrar al repo. Define qué construimos, para quién, con qué reglas, y dónde encontrar el resto del conocimiento.

## Qué construimos

**SistemaVentaRapida** es un POS (Point of Sale) SaaS multi-tenant para LATAM. Permite a comerciantes manejar ventas, inventario, comprobantes legales y reportes, desde una bodega de esquina hasta cadenas multi-sucursal y mayoristas con clientes a crédito.

### Mercados objetivo

| Vertical | Tamaño típico | Features prioritarios |
|---|---|---|
| Bodega de esquina | 1 caja, 200-500 productos | POS simple, escaneo rápido, vuelto, fiado opcional |
| Minimarket multi-cajero | 2-5 cajeros, 1k-5k productos | Roles, turnos, arqueo, inventario serio |
| Mayorista / cash & carry | Múltiples sucursales, créditos | Listas precio por volumen, créditos, conciliación |

### Países

- **Perú** (SUNAT, RUC, boleta/factura electrónica) — primera prioridad
- **Venezuela** (SENIAT, RIF) — segunda prioridad
- Estructura abierta para sumar Colombia, Bolivia, Ecuador sin reescribir core

## Stack técnico

- **Backend**: NestJS 11 + Prisma 6 + PostgreSQL + JWT auth + class-validator
- **Frontend**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + Zustand 5 + lucide-react
- **SUNAT**: integración con código propio (NO NubeFact). Firma digital con certificado del cliente
- **Multi-tenancy**: discriminator column `tenantId` en TODAS las tablas de dominio
- **Money**: `Decimal(15, 4)`, NUNCA Float

## Arquitectura senior (regla maestra)

**NO somos un monolito modular clásico.** Aplicamos **Clean Architecture + Hexagonal (Ports & Adapters) + Event-Driven** desde el día 1, manteniendo el repo como mono-repo desplegable. Cuando un bounded context lo amerite por carga real, se extrae a servicio independiente sin reescribir lógica de dominio.

### Layers (Clean Architecture)

Cada bounded context (módulo) tiene su estructura interna:

```
modules/<bounded-context>/
├── domain/              ← entities, value objects, domain events, domain services. CERO dependencias externas
├── application/         ← use cases, ports (interfaces). Dependen solo de domain
├── infrastructure/      ← adapters: prisma repo, sunat client, queue publisher. Implementan ports
├── interface/           ← controllers HTTP, event handlers, CLI. Llama use cases
└── CLAUDE.md
```

**Reglas de dependencia (inviolables):**

- `domain` → no depende de nadie
- `application` → depende solo de `domain`
- `infrastructure` → implementa interfaces de `application` (Dependency Inversion)
- `interface` → orquesta `application`, nunca lógica de negocio

Si un agente importa `prisma` en `domain/` o `application/` → es violación, el linter (lint-arch) lo detecta y el QA lo rechaza.

### Hexagonal / Ports & Adapters

- Cada integración externa (Prisma, SUNAT, SENIAT, Email, Storage, Queue) tiene su **Port** (interface en `application/ports/`)
- Implementaciones (Adapters) viven en `infrastructure/`. Intercambiables sin tocar use cases
- Ejemplo: `IFiscalEmitter` con adapters `SunatEmitterAdapter` y `SeniatEmitterAdapter`. Use case `EmitReceiptUseCase` no sabe cuál es

### Event-Driven interno

- Cuando ocurre algo del dominio (ej. `SaleCompleted`, `StockDepleted`, `CashShiftClosed`) → se emite **Domain Event**
- Bus interno (NestJS EventEmitter en MVP, migrable a RabbitMQ/Kafka cuando escale)
- Handlers en otros bounded contexts escuchan y reaccionan (ej. Inventory escucha `SaleCompleted` para descontar stock)
- **Beneficio**: bounded contexts desacoplados. Mañana puedes extraer Inventory a microservicio y solo cambias el transport del bus

### Rutas centralizadas

- **Frontend**: archivo único `src/lib/routes.ts` con todas las rutas tipadas como constantes. NUNCA hardcoded strings de URLs en componentes
- **Backend**: prefijos por módulo (`@Controller('sales')`), versionado vía `/api/v1/...`. Catálogo en `src/common/routes/api-routes.ts`
- **i18n**: rutas no traducidas (siempre inglés en URL: `/sales`, `/inventory`), labels traducidas

### DRY (Don't Repeat Yourself) — pero con criterio

- Lógica de dominio repetida >2 veces → refactor a domain service o value object
- Validaciones repetidas → custom validators en `common/validators/`
- Componentes UI repetidos → primitives en `components/ui/`
- **PERO**: NO sobre-abstraigas. Tres usages similares en bounded contexts distintos NO se comparten — duplicación cross-context es ACEPTABLE para mantener autonomía. La regla DRY aplica DENTRO de un bounded context, no a través de ellos

### Escalable y mantenible

- **Add a feature = add a module, no toques los otros**
- Tests por bounded context (no por capa) — facilita refactors locales
- Versionado API estricto (`v1`, `v2` en paralelo durante migraciones)
- Migraciones zero-downtime obligatorias (add column nullable → backfill → not null en sig migración)
- Logs estructurados con correlation ID (request-id propagado entre contexts)
- Health checks por servicio: `/health/live` (k8s liveness), `/health/ready` (readiness)
- Graceful shutdown obligatorio

### Por qué NO microservicios desde día 1

Con 2 devs + Max $100, microservicios reales = overhead infinito (deploy múltiple, networking, observabilidad, consistencia eventual debugging). El **Modular Monolith con Clean Architecture** te da el 90% del beneficio (boundaries claros, sustituibilidad, testabilidad) sin el costo operativo. Cuando un módulo tenga carga real distinta del resto, lo extraes — la arquitectura ya lo permite porque depende de Ports/Events, no de implementaciones concretas.

## Lenguaje ubicuo bilingüe

| Dominio (español, legal/UI) | Código (inglés) |
|---|---|
| Usuario | User |
| Producto | Product |
| Venta | Sale |
| Comprobante | Receipt (genérico) |
| Boleta | SaleReceipt |
| Factura | InvoiceReceipt |
| Nota de crédito | CreditNote |
| Sucursal | Branch |
| Caja | CashRegister |
| Turno | Shift |
| Arqueo de caja | CashCount |
| Cliente | Customer |
| Proveedor | Supplier |
| Inventario | Inventory |
| Stock | Stock |
| Movimiento de stock | StockMovement |
| Línea de crédito | CreditLine |
| Lista de precios | PriceList |

**Mantenido por el agente Architect en `docs/glossary.md`.** Si necesitas un término nuevo, primero revisa ahí. Si no existe, lo propones al Architect vía issue.

## Reglas inviolables

1. **Multi-tenancy obligatoria**: cada query Prisma debe filtrar por `tenantId`. Sin excepción
2. **Money es Decimal**, nunca Float ni Number JS
3. **Inputs siempre validados** con `class-validator` (DTO) o `zod` (frontend). Validación dual: cliente (UX) + servidor (seguridad). Sin esto, no se mergea
4. **Tests verdes son requisito para merge**: el agente QA tiene veto
5. **ADRs obligatorios** para decisiones arquitectónicas: en `docs/adr/NNN-titulo.md`, formato Context/Decision/Consequences/Alternatives
6. **Cada carpeta nueva tiene su `CLAUDE.md`** explicando su contexto (regla para Architect cuando estructura el repo)
7. **Comprobantes SUNAT/SENIAT** usan el código propio del usuario, no APIs de terceros
8. **Operaciones que tocan >1 tabla**: `prisma.$transaction()` obligatorio
9. **Soft deletes** (`deletedAt`) en entidades críticas. Hard delete solo Admin
10. **No `any`, no `console.log`, no secretos hardcoded**
11. **Clean Architecture obligatoria**: domain → application → infrastructure / interface. Cero violaciones de dependencia
12. **Ports & Adapters** para todo lo externo: prisma, sunat, email, queue. Use cases dependen de interfaces
13. **Rutas centralizadas**: frontend en `lib/routes.ts`, backend con prefijos por módulo + versionado `/api/v1/...`
14. **DRY dentro del bounded context**, duplicación aceptable entre bounded contexts distintos (autonomía > coupling)
15. **Domain events** para comunicación entre bounded contexts. NO imports directos entre módulos
16. **API versionada**: v1 nunca rompe contract. Cambio breaking = v2 en paralelo
17. **Migrations zero-downtime**: add nullable → backfill → not null
18. **Correlation ID** propagado en logs (request-id en todos los logs de un request)
19. **Sin features innecesarias**: si no está en el ADR/issue, no se construye. YAGNI

## Equipo de agentes IA (vía Paperclip)

| Agente | Responsabilidad |
|---|---|
| **Architect** | Decisiones de arquitectura, ADRs, glosario, refactor estructural |
| **Orchestrator** | PM: descompone requests y enruta |
| **Backend Developer** | NestJS + Prisma + SUNAT |
| **Frontend Developer** | Next.js + Tailwind + Zustand |
| **DBA** | Schema, queries, migraciones, transaccionalidad |
| **QA Engineer** | Tests unit + integration + E2E Playwright, edge cases |
| **Security Hacker** | Pentesting continuo, OWASP, input fuzzing |
| **GitHub Manager** | PRs, review, merge gates |
| **LLM Router** | Decide Claude vs Ollama local por tarea |

**Comportamiento**: 100% autónomo (commit + merge sin aprobación humana). Para frenar un cambio: pausar el agente desde el panel Paperclip.

## Estructura del repo (Clean Architecture + Hexagonal)

```
SistemaVentaRapida/
├── CLAUDE.md                              ← este archivo
├── README.md                              ← onboarding humano
│
├── backend/                               ← NestJS
│   ├── CLAUDE.md
│   └── src/
│       ├── modules/                       ← un módulo por BOUNDED CONTEXT
│       │   ├── sales/                     ← ejemplo
│       │   │   ├── CLAUDE.md
│       │   │   ├── domain/                ← entities, VOs, domain events. CERO deps externas
│       │   │   │   ├── sale.entity.ts
│       │   │   │   ├── sale-item.value-object.ts
│       │   │   │   ├── events/sale-completed.event.ts
│       │   │   │   └── services/pricing.domain-service.ts
│       │   │   ├── application/           ← use cases + ports
│       │   │   │   ├── use-cases/create-sale.use-case.ts
│       │   │   │   ├── ports/sale.repository.port.ts
│       │   │   │   └── ports/receipt-emitter.port.ts
│       │   │   ├── infrastructure/        ← adapters
│       │   │   │   ├── persistence/prisma-sale.repository.ts
│       │   │   │   └── messaging/sale-event-publisher.ts
│       │   │   ├── interface/             ← controllers, event handlers
│       │   │   │   ├── http/sales.controller.ts
│       │   │   │   └── events/stock-depleted.handler.ts
│       │   │   └── sales.module.ts
│       │   ├── inventory/                 ← otro bounded context
│       │   ├── catalog/
│       │   ├── cash/
│       │   ├── receipts/                  ← SUNAT + SENIAT vía port
│       │   └── identity/                  ← users, tenants, RBAC
│       ├── common/                        ← cross-cutting (logger, errors, middleware multi-tenant)
│       │   ├── routes/api-routes.ts       ← rutas centralizadas backend
│       │   └── validators/                ← RUC, RIF, EAN-13
│       └── shared-kernel/                 ← types/VOs compartidos entre contexts (Money, TenantId)
│
├── frontend/                              ← Next.js
│   ├── CLAUDE.md
│   └── src/
│       ├── app/                           ← App Router routes
│       ├── features/                      ← organizado por FEATURE, no por type
│       │   ├── pos/                       ← POS de venta (pantalla estrella)
│       │   ├── inventory/
│       │   ├── reports/
│       │   └── settings/
│       ├── components/ui/                 ← primitives reusables
│       ├── stores/                        ← Zustand stores por feature
│       └── lib/
│           ├── routes.ts                  ← TODAS las rutas tipadas centralizadas
│           ├── api/                       ← cliente HTTP por feature
│           ├── i18n/                      ← es-PE, es-VE
│           └── format/                    ← money, date, number por país
│
├── docs/
│   ├── CLAUDE.md
│   ├── adr/                               ← Architecture Decision Records (NNN-titulo.md)
│   ├── glossary.md                        ← lenguaje ubicuo bilingüe
│   ├── analysis/                          ← análisis iniciales y reports
│   ├── db/                                ← ER, performance reports
│   ├── qa/                                ← test strategy
│   └── security/                          ← threat model, findings
│
├── tests/
│   └── e2e/                               ← Playwright suites organizadas por feature
│
└── tools/                                 ← scripts de dev (no producción)
    ├── arch-lint/                         ← valida reglas de dependencia Clean Arch
    └── seed/                              ← seeds idempotentes por tenant
```

## Onboarding rápido para agentes nuevos

1. Lee este CLAUDE.md
2. Lee `docs/glossary.md`
3. Lee `docs/adr/` (todos los ADRs en orden)
4. Lee el CLAUDE.md de la carpeta donde vas a trabajar
5. Solo entonces escribe código

## Información del proyecto en Paperclip

- Company: **SistemaVentaRapida Ops** (prefix `SIS`)
- URL: http://127.0.0.1:3100/SIS
- Repo: https://github.com/roberto3101/VentaRapidaSaas

## Quién manda

El humano es **Roberto** (board). Los agentes ejecutan, el Architect propone, Roberto decide casos ambiguos. Sin decisión humana = se hace lo que diga el ADR vigente.
