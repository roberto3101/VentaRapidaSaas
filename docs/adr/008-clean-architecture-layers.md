# ADR-006: Clean Architecture + Hexagonal layers para todos los bounded contexts

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-28 (depende de SIS-1, [[001-multi-tenancy-strategy]], [[003-fiscal-emission-hexagonal]])
- **Supersedes**: estructura `backend/CLAUDE.md` previa que documentaba layout NestJS plano (`controller + service + dto`)

## Context

El `CLAUDE.md` raíz §31-95 define **Clean Architecture + Hexagonal (Ports & Adapters) + Event-Driven desde día 1**. El backend actual NO cumple esa regla — auditoría (SIS-28):

- `backend/src/modulos/<x>/` contiene solo `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`.
- No hay `domain/`, `application/`, `infrastructure/`, `interface/`.
- `ProductosService`, `InventarioService`, etc. importan `DatabaseService` (`PrismaClient`) directamente — Prisma acoplado a la capa que debería ser dominio puro.
- `DatabaseService` (líneas 61-181) contiene métodos de dominio (`obtenerPrecioEfectivo`, `obtenerStockDetallado`, `obtenerMovimientosRecientes`) — son lógica de negocio metida en el adapter de persistencia. Capa equivocada.
- El path es además español (`modulos/`) cuando el CLAUDE.md raíz fija inglés en código (`modules/`).
- No existe `tools/arch-lint/` aunque el CLAUDE.md raíz lo promete.
- `backend/CLAUDE.md` describe una estructura plana (`<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.repository.ts`) **incompatible** con la regla del CLAUDE.md raíz. Hay que reconciliar — esta ADR es el ancla.

Sin esta refactor, agregar `sales/`, `receipts/`, `cash/`, `shifts/` sobre el patrón plano produce dependencia transversal a Prisma, lógica de dominio mezclada con I/O, e imposibilidad de testear casos de uso sin levantar BD. El producto apunta a 5000 productos × 50 sucursales × 2 países, con SUNAT/SENIAT vía hexagonal ([[003-fiscal-emission-hexagonal]]) — el modelo de capas debe ser uniforme en todos los contexts o el adapter fiscal vive en una isla y los demás siguen acoplados.

## Decision

Adoptamos **Clean Architecture estricta** en `backend/src/modules/<bounded-context>/` con 4 capas obligatorias, **Hexagonal (Ports & Adapters)** para integraciones externas, y **arch-lint** que falla CI si se viola la dirección de dependencias.

### 1. Layout obligatorio por bounded context

```
backend/src/modules/<bounded-context>/
├── CLAUDE.md                            ← contexto del módulo
├── domain/                              ← núcleo. CERO dependencias externas
│   ├── entities/
│   │   └── <entity>.entity.ts
│   ├── value-objects/
│   │   └── <vo>.vo.ts
│   ├── events/
│   │   └── <event>.event.ts
│   ├── services/
│   │   └── <service>.domain-service.ts
│   └── errors/
│       └── <error>.error.ts
├── application/                         ← orquesta domain. Define puertos
│   ├── use-cases/
│   │   └── <verb>-<noun>.use-case.ts
│   ├── ports/
│   │   ├── <entity>.repository.port.ts
│   │   └── <integration>.port.ts
│   └── dto/                             ← input/output de use cases (NO HTTP DTOs)
│       └── <verb>-<noun>.io.ts
├── infrastructure/                      ← adapters: implementa ports
│   ├── persistence/
│   │   └── prisma-<entity>.repository.ts
│   ├── messaging/
│   │   └── <event>-publisher.ts
│   └── external/
│       └── <vendor>-<port>.adapter.ts
├── interface/                           ← HTTP / events / CLI
│   ├── http/
│   │   ├── <name>.controller.ts
│   │   └── dto/                         ← HTTP DTOs class-validator
│   └── events/
│       └── <other-context>-<event>.handler.ts
└── <bounded-context>.module.ts          ← NestJS wiring: registra controllers + provee adapters bajo tokens de port
```

### 2. Reglas de dependencia (inviolables)

| De →           | Puede importar                                     | NO puede importar                                          |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `domain`       | nada externo. Solo `shared-kernel/` (VOs comunes). | `@prisma/client`, `@nestjs/*`, `application/`, `infrastructure/`, `interface/`. |
| `application`  | `domain/`, `shared-kernel/`.                       | `infrastructure/`, `interface/`, `@prisma/client`, transports concretos. |
| `infrastructure` | `application/ports/`, `domain/`, `shared-kernel/`, `@prisma/client`, vendor SDKs. | `interface/`, otras `<context>/infrastructure/` (cross-context adapter coupling). |
| `interface`    | `application/use-cases/`, `application/dto/`, `domain/` (solo tipos read-only), `@nestjs/*`, `shared-kernel/`. | `infrastructure/` directamente (debe inyectarse vía DI), lógica de negocio inline. |
| `shared-kernel` | nada del proyecto.                                | TODO lo del proyecto. Solo tipos universales (Money, TenantId, Sku, Result). |

**Decoradores NestJS en `domain/` o `application/` están prohibidos** — el dominio se prueba sin levantar Nest.

### 3. Hexagonal (Ports & Adapters)

Toda integración externa cruza un puerto:

- **Persistencia**: `IProductRepository` en `application/ports/`, `PrismaProductRepository` en `infrastructure/persistence/`.
- **Fiscal**: `IFiscalEmitter` ([[003-fiscal-emission-hexagonal]]).
- **Mensajería**: `IEventPublisher` (genérico, en `shared-kernel/`).
- **Email, Storage, Queue, ExchangeRate, KMS**: cada uno su puerto.

Los use cases reciben **interfaces**, nunca clases concretas. El `<context>.module.ts` resuelve la inyección via tokens (`provide: PRODUCT_REPOSITORY_PORT, useClass: PrismaProductRepository`).

### 4. Event-Driven entre bounded contexts

**Cero imports cruzados entre módulos.** Si `inventory/` necesita reaccionar a una venta:

1. `sales/` emite `SaleCompletedEvent` (domain event, payload serializable).
2. `inventory/interface/events/sale-completed.handler.ts` escucha y dispara `AdjustStockUseCase`.
3. El bus es `EventEmitter2` (NestJS) en MVP; migrable a RabbitMQ/Kafka sin cambiar handlers.

`shared-kernel/events/` define la interfaz `IDomainEvent` y el publisher port. Cada handler vive en `interface/events/` del context **consumidor**.

### 5. DTOs: dos familias, no confundir

- **HTTP DTOs** (`interface/http/dto/`): class-validator, mapping desde request body. Pueden ser español si la API lo expone (es el caso actual con `CrearProductoDto`).
- **Use case I/O** (`application/dto/`): tipos puros (interfaces o classes sin decoradores). En **inglés**. El controller traduce HTTP DTO → use case input. Esta separación evita que la capa de aplicación dependa de `class-validator` o del shape HTTP.

### 6. Naming

- **Carpetas y archivos**: inglés (`modules/products/`, no `modulos/productos/`).
- **HTTP routes**: pueden mantener español si ya están publicadas (`@Controller('productos')`) — versionado v2 las migrará a inglés. Para módulos nuevos: inglés desde el inicio.
- **Identifiers en código (clases, métodos, variables)**: inglés. Glosario es↔en en `docs/glossary.md` es la fuente de verdad.

### 7. arch-lint (enforcement)

`tools/arch-lint/` — script Node ejecutable como `pnpm arch-lint` y wired en CI + pre-commit. Reglas (v1):

1. Archivos bajo `domain/` no importan de `@prisma/client`, `@nestjs/*`, `../application`, `../infrastructure`, `../interface`, ni de otros `modules/*/`.
2. Archivos bajo `application/` no importan de `../infrastructure`, `../interface`, `@prisma/client`, ni de otros `modules/*/`.
3. Archivos bajo `interface/` no importan de `../infrastructure` (DI lo provee).
4. Archivos bajo `infrastructure/` no importan de otros `modules/*/infrastructure/`.
5. Cualquier import con path absoluto a `src/modulos/*` (legacy) genera warning hasta SIS-XX que renombra a `modules/`.

Salida del linter: lista de violaciones con path:line y regla violada. Exit code != 0 en CI.

### 8. Migración de los módulos existentes

- **Reference vertical**: `productos` → `modules/products/` con el layout completo. Lo hace el Architect en esta misma issue (SIS-28).
- **Resto**: child issues por bounded context, asignadas a Backend Dev (`dc926c53`). Orden propuesto:
  1. `modules/inventory/` (alto impacto, depende de products + sale events futuros).
  2. `modules/catalog/` (categorías, categorías → catalog).
  3. `modules/contacts/` (clientes y proveedores).
  4. `modules/pricing/`.
  5. `modules/transfers/`.
  6. `modules/locations/` (sedes → branches/locations — alinear con glosario).
  7. `modules/identity/` (users + tenants + auth).
  8. `modules/reports/`.

Cada migración es un PR independiente, mergeable cuando arch-lint pasa y tests cubren el comportamiento previo.

### 9. `DatabaseService` queda como cliente Prisma puro

Los métodos de dominio (`obtenerPrecioEfectivo`, `obtenerStockDetallado`, `obtenerMovimientosRecientes`, `obtenerStockTotal`, `obtenerResumenSedes`) **se mueven** a:

- `modules/pricing/infrastructure/persistence/prisma-pricing.repository.ts` (precio efectivo, tasa impuesto).
- `modules/inventory/infrastructure/persistence/prisma-stock.repository.ts` (stock detallado, movimientos, total).
- `modules/locations/infrastructure/persistence/prisma-location.repository.ts` (resumen sedes).

`DatabaseService` retiene únicamente: `$connect/$disconnect`, `transaccionConTenant`, helpers genéricos de secuencia. Las queries `$executeRawUnsafe` con interpolación de strings (SQL injection latente en `obtenerStockDetallado`) **se migran a `$queryRaw` parametrizado** durante el movimiento. Bug crítico ligado a [[001-multi-tenancy-strategy]] §Riesgos abiertos.

## Consequences

### Positivas

- Reglas claras → menos litigio entre agentes; reviewer / QA tienen una checklist objetiva.
- Use cases testeables sin Prisma, sin Nest, sin HTTP — tests unit verdaderos.
- Cambio de ORM (Prisma → Drizzle, lo que sea) toca solo `infrastructure/`.
- Extracción a microservicio cuando un context lo amerite: cambias el adapter de mensajería; dominio no se mueve.
- `arch-lint` previene regresiones — la arquitectura no depende de la disciplina humana.
- `DatabaseService` deja de ser un cajón de sastre. La caja “dios” que tiene 180 líneas con lógica de negocio se rompe.

### Negativas

- Más archivos por módulo (de ~4 a ~10-15). Curva de entrada para Backend Dev.
- Mapping HTTP DTO ↔ use case I/O ↔ domain entity es repetitivo. Mitigación: usar `class-transformer` para boilerplate, generar mappers cuando se note dolor real (NO antes — YAGNI).
- Refactor de 10 módulos llevará 2-3 semanas de Backend Dev. Bloquea ligeramente la velocidad de features nuevas. **Aceptado** — costo de no hacerlo crece exponencial.

### Riesgos abiertos

- **Adopción**: si Backend Dev empieza a crear módulos sin seguir el layout, arch-lint debe atraparlo desde el primer PR. QA tiene veto si arch-lint falla.
- **Naming `modulos/` → `modules/`**: requiere migración coordinada de imports en todo el repo. Child issue dedicada.
- **DTOs duplicados (HTTP + use case I/O)**: tentación de "compartir" la clase. Prohibido — añade acople a `class-validator` en `application/`. Si el dolor es real, generar el use case DTO desde el HTTP DTO con `class-transformer.plainToClass`, no fusionar tipos.

## Alternatives considered

### A. Mantener layout NestJS plano + comentar que "es buena práctica" Clean Arch

- **Contras**: la disciplina sin enforcement no escala con agentes IA paralelos. Cada Backend Dev / agente decide por su cuenta. Descartado.

### B. Onion Architecture en vez de Clean

- **Pros**: nombre menos cargado, menos capas (3 vs 4).
- **Contras**: la diferencia es semántica; la pérdida es el bus de eventos explícito y la capa `interface/` separada. Para un sistema con HTTP + handlers de eventos + futuros CLIs, las 4 capas son útiles. Mantener Clean.

### C. Vertical Slice Architecture (feature folders, sin capas)

- **Pros**: ligero, rápido para CRUDs.
- **Contras**: el dominio fiscal (SUNAT/SENIAT) y el motor de stock con concurrencia ([[005-sale-concurrency]]) no son CRUDs — son lógica compleja que merece dominio aislado. Vertical slice colapsa cuando el dominio crece. Descartado.

### D. Hexagonal sin Clean (solo ports/adapters, sin separar domain/application)

- **Pros**: dos capas menos.
- **Contras**: pierdes la distinción entre "regla de negocio pura" (domain) y "orquestación de caso de uso" (application). El primero se prueba sin mocks; el segundo coordina ports. Mezclarlos lleva a use cases con lógica de negocio enterrada en ifs. Descartado.

### E. Hacer Clean Arch solo en módulos nuevos, dejar legacy plano

- **Pros**: menos refactor inmediato.
- **Contras**: la base actual tiene exactamente los bounded contexts que más crecerán (productos, inventario, contactos). Diferirlo solo aumenta la deuda. Descartado.

## Implementation plan (resumen — issues hijo en SIS-28)

1. ✅ Esta ADR (SIS-28, Architect).
2. ✅ Reference vertical: `modules/products/` con domain/application/infrastructure/interface completos + `ProductsModule` que reemplaza `ProductosModule`. Mantiene HTTP path `/productos` por retrocompat. Tests unit del use case sin Prisma.
3. ✅ `tools/arch-lint/` v1: reglas 1-5. Script `pnpm arch-lint` y check en CI.
4. ✅ `backend/CLAUDE.md` actualizado para reflejar el nuevo layout (queda alineado con el CLAUDE.md raíz).
5. Child issues (SIS-XX) por context restante. Asignadas a Backend Dev. QA valida arch-lint + cobertura de comportamiento previo.
6. Child issue para migrar `modulos/` → `modules/` (rename masivo + imports). Solo después de que dos verticals estén refactorizadas y el patrón sea sólido.
7. Child issue para mover métodos de dominio fuera de `DatabaseService` a repos específicos (`pricing`, `inventory`, `locations`).

## References

- Robert C. Martin, "Clean Architecture" (2017) — capas + dependency rule.
- Alistair Cockburn, "Hexagonal Architecture" (2005) — ports & adapters.
- NestJS Architecture docs: https://docs.nestjs.com/architecture
- [[001-multi-tenancy-strategy]]
- [[003-fiscal-emission-hexagonal]]
- [[005-sale-concurrency]]
