# Initial Report — SistemaVentaRapida Pro

- **Status**: Snapshot 2026-05-20
- **Author**: Architect (completado manualmente tras run truncado)
- **Issue**: SIS-1

> Este documento cierra la **Parte A + B** del issue SIS-1 que el Architect no alcanzó a materializar antes de que se agotara la ventana de tokens. Los 7 ADRs en `docs/adr/` y el `docs/glossary.md` SÍ se completaron en el mismo ciclo.

---

## Parte A — Análisis del repo actual

### Stack confirmado

| Capa | Tech | Versión |
|---|---|---|
| Backend | NestJS | 11 |
| ORM | Prisma | 6 |
| BD | PostgreSQL | 17 (embedded en dev) |
| Auth | JWT + Passport + bcryptjs | — |
| Frontend | Next.js (App Router) | 16 |
| UI | React + Tailwind + Zustand + lucide-react | 19 / 4 / 5 / — |
| Package manager | pnpm / bun (mixto) | — |

### Estructura actual (NO alineada con CLAUDE.md raíz)

```
backend/src/
├── modulos/            ← ⚠️ ESPAÑOL — debería ser modules/ (regla CLAUDE.md raíz)
│   ├── inventario/
│   ├── productos/
│   └── reportes/
├── database/
│   └── database.service.ts  ← ⚠️ tiene lógica de dominio mezclada (obtenerPrecioEfectivo, etc.)
├── common/
│   └── middleware/origen-permitido.middleware.ts (nuevo)
├── config/
├── main.ts
└── app.module.ts
```

### Deuda técnica detectada (priorizada)

| # | Hallazgo | Severidad | Origen |
|---|---|---|---|
| 1 | `auth.service.ts:30` — login global sin filtro `tenantId` (cross-tenant leak risk) | **CRITICAL** | ADR-001 |
| 2 | `$executeRawUnsafe` con string interpolation del UUID — SQL injection risk | **CRITICAL** | ADR-001 |
| 3 | `modulos/` en español viola regla de glosario (debería ser `modules/` en inglés) | HIGH | Glossary + CLAUDE.md raíz |
| 4 | `DatabaseService` contiene lógica de negocio (`obtenerPrecioEfectivo`, etc.) — viola Clean Architecture | HIGH | ADR-008 |
| 5 | No hay capas `domain/application/infrastructure/interface/` por bounded context | HIGH | ADR-008 |
| 6 | No hay `tenant_id` middleware + RLS PostgreSQL — solo filtros aplicativos | HIGH | ADR-001 |
| 7 | No hay tests de aislamiento multi-tenant (E2E con 2 JWTs) | HIGH | ADR-001 |
| 8 | Money probablemente con `Float` (revisar) — debe ser `Decimal(15,4)` | HIGH | ADR-004 |
| 9 | Frontend en `bun.lock` PERO backend posiblemente en `pnpm-lock` — unificar | MEDIUM | — |
| 10 | `Branch` (sucursal) se llama `Location` en código actual — renombrar | MEDIUM | Glossary |
| 11 | Roles `location_manager` y `operator` no coinciden con glosario | MEDIUM | Glossary |
| 12 | No hay `tools/arch-lint/` aunque CLAUDE.md raíz lo promete | MEDIUM | ADR-008 |
| 13 | No hay versionado API `/api/v1/...` — agregar | MEDIUM | CLAUDE.md raíz |
| 14 | No hay rutas centralizadas (frontend `lib/routes.ts`) | LOW | CLAUDE.md raíz |
| 15 | Falta correlation ID en logs | LOW | CLAUDE.md raíz |

### Gaps para el alcance (multi-tenant + multi-país PE+VE + multi-tipo-negocio)

**Lo que existe**: módulos básicos productos, inventario, reportes. Auth JWT. Multi-tenant parcial.

**Lo que falta para MVP esquina (Fase 3)**:
- Bounded contexts `sales/`, `receipts/`, `cash/`, `shifts/`, `catalog/`, `identity/`
- Refactor completo a Clean Architecture (ADR-008)
- POS de venta funcional (escaneo + carrito + cobro + boleta)
- Reportes diarios (cierre de turno, ventas por hora)

**Lo que falta para multi-país (Fase 4)**:
- Tabla `Country` con catálogos por país
- Strategy pattern para reglas tributarias (ADR-002)
- Adapter SENIAT para Venezuela (paralelo al SUNAT propio)
- i18n switch por tenant (ADR-007)

**Lo que falta para mayorista (Fase 6)**:
- `CreditLine` (líneas de crédito)
- `PriceList` (listas de precios por volumen)
- Conciliación bancaria

---

## Parte B — Análisis competidores

### Mercado Perú

| Competidor | Pricing | Fortalezas | Debilidades | Cómo diferenciarnos |
|---|---|---|---|---|
| **NubeFact** | S/30-100/mes | Líder facturación electrónica. API estable. | Solo facturación (no POS). UX dated. | Nosotros POS + facturación integrada, no API tercero |
| **Facturo.pe** | S/69.90 → S/159 | POS + facturación. UI moderna. | Cobra por volumen de comprobantes (escala mata margen) | Comprobantes ilimitados a precio fijo (gracias a SUNAT propio) |
| **Quesito.pe** | S/50-130 | Multi-sucursal, hardware POS partner | Setup pesado, soporte vía ticket | Onboarding rápido + canal humano (amigo) |
| **Bsale** | S/100-300 | Maduro, 14+ años, cadenas grandes | Caro, complejo, overhead grande para PYME | Más liviano, multi-país desde día 1 |
| **Hi POS** | S/60-180 | UI clean, integraciones | Solo Perú | Multi-país PE+VE |
| **QPos** | S/40-100 | Económico | Features limitados | Más features al mismo precio |
| **Yastá** | S/45-120 | Mypes y emprendedores | Limitado en multi-cajero | Multi-cajero + turnos serios |
| **Easy POS** | S/80-200 | Restaurantes especialistas | Solo Perú, no bodega | Nosotros vertical bodega/minimarket primero |

### Mercado Venezuela

| Competidor | Notas |
|---|---|
| **Mira Solutions** | Líder local. POS + facturación SENIAT. UI muy dated. |
| **Profit Plus** | ERP-completo. Caro para PYMES. |
| **Galac** | Contable + POS. Fuerte en contabilidad, débil en POS UX. |
| **A2 SoftWay** | Líder mayorista. UX legacy. |
| **OpenBravo / Odoo VE** | Open-source pero requiere implementador local. |

**Observación clave**: el mercado venezolano tiene MENOS competencia moderna que el peruano. Hay oportunidad clara para entrar con UX moderna + multi-país.

### Posicionamiento propuesto

> *"El POS multi-país (Perú + Venezuela) con facturación electrónica integrada, comprobantes ilimitados a precio fijo, y onboarding por humano cercano. Escala de bodega-de-esquina a multi-sucursal sin cambiar de software."*

**Pilares de diferenciación**:

1. **Comprobantes ilimitados a precio fijo** (gracias a SUNAT propio, sin API tercero)
2. **Multi-país desde día 1** (PE + VE, escalable a CO/BO/EC)
3. **Onboarding humano** vía canal del amigo (no autoservicio frío)
4. **Modular escalable** (bodega esquina → minimarket → mayorista sin cambiar app)
5. **Clean Architecture** = features nuevas en semanas, no meses (vs Bsale legacy)

---

## Parte C — Roadmap técnico (confirma sub-goals existentes)

Los 7 sub-goals en Paperclip (Fase 1 a Fase 7) **se confirman** sin cambios mayores. Cada fase debe respetar:

1. Refactor incremental al Clean Architecture (ADR-008) — NO big-bang
2. Cada feature nueva pasa por ADR si toca dominio o integración
3. Tests E2E multi-tenant son **gate obligatorio**

### Dependencias críticas entre fases

```
Fase 1 (Discovery+ADRs)                ← DONE (este doc)
   ↓
Fase 2 (Foundation: multi-tenant + auth + i18n)   ← BLOQUEA todo lo demás
   ↓
Fase 3 (Core MVP esquina)
   ↓
Fase 4 (Multi-país + SUNAT/SENIAT)
   ↓
Fase 5 (Multi-cajero + turnos + inventario serio)
   ↓
Fase 6 (Mayorista features)
   ↓
Fase 7 (Polish + hardening + perf)
```

### Riesgos por fase

| Fase | Riesgo principal | Mitigación |
|---|---|---|
| 2 | Refactor de `modulos/` → `modules/` rompe imports existentes | Compatibility shim 2 semanas + alias en `tsconfig` |
| 3 | UX POS debe ser PERFECTO (cajeros usan 8h/día) | Test con cajero real antes de release |
| 4 | SENIAT documentation escasa | Architect investiga 1 semana antes |
| 5 | Concurrencia en stock — locks pueden deadlock | ADR-005 ya documenta estrategia |
| 6 | Lógica de crédito tiene mil edge cases | Glosario de reglas + tests exhaustivos |
| 7 | Performance bajo carga real desconocido | Tests k6 desde Fase 5 |

---

## Próximos pasos para cuando se renueve la cuota

### Issues a crear (orden de prioridad)

1. **SIS-CRITICAL-1**: Fix `auth.service.ts:30` — añadir `tenantId` al login. Bloquea producción.
2. **SIS-CRITICAL-2**: Reemplazar `$executeRawUnsafe` por `$executeRaw` parametrizado. SQL injection.
3. **SIS-HIGH-3**: Refactor `modulos/` → `modules/` (puede hacerse incremental, 1 módulo por PR).
4. **SIS-HIGH-4**: Extraer lógica de dominio de `DatabaseService` a `*.domain-service.ts` (ADR-008).
5. **SIS-HIGH-5**: Crear `bounded-context` `identity/` siguiendo ADR-008 (es el más simple, sirve de template).
6. **SIS-HIGH-6**: Implementar Prisma middleware `tenantId` + RLS PostgreSQL (ADR-001).
7. **SIS-HIGH-7**: Tests E2E multi-tenant (2 tenants + 2 JWTs).
8. **SIS-MED-8**: Crear `tools/arch-lint/` que valide reglas Clean Architecture.
9. **SIS-MED-9**: Migrar `Float` → `Decimal` (ADR-004).
10. **SIS-MED-10**: Versionar API `/api/v1/...` + alias temporal sin versión.

### Notas para los agentes

Cuando re-actives Paperclip:
- **Pausa todas las routines** y trabaja con asignación manual de issues
- **El Architect ya tiene los 7 ADRs y glosario** — no rehacerlos
- **Empezar por SIS-CRITICAL-1 y SIS-CRITICAL-2** (1-2 días cada uno, bloquean producción)
- **Después SIS-HIGH-5** (template `identity/`) — sirve para que otros agentes copien la estructura

### Estimación de tokens para finalizar Fase 2

Conservadora (con Sonnet 4.7, sin Opus salvo decisiones críticas, concurrencia 1):

- 10 issues × 30K tokens/issue (in+out) ≈ **300K tokens** = 1-2 días de cuota Max si todo va bien
- Con QA + Security en paralelo: +30%
- Total Fase 2: **2-4 días de cuota Max** si los agentes no se atascan
