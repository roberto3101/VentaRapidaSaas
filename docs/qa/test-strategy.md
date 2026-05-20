# Test Strategy — SistemaVentaRapida Pro

- **Status**: Baseline v1
- **Owner**: QA Engineer agent
- **Date**: 2026-05-20
- **Referencias**: CLAUDE.md raíz §reglas inviolables, ADR-001 (multi-tenancy), skill `08-qa-engineer.md`

> Estrategia operativa de QA. Define qué tests son obligatorios, cuándo se ejecutan, y los criterios de "verde para merge". Sin tests verdes según esta estrategia, el GitHub Manager no mergea.

## Pirámide de tests

```
       /\
      /E2\        ~10-20 tests críticos (flujos POS, multi-tenant, SUNAT)
     /----\
    /  Int  \    ~50-100 tests por bounded context (BD real, multi-tenant)
   /--------\
  /  Unit    \   ~70%+ cobertura en services, 100% en utilities críticas (money, date, validators)
 /------------\
```

Proporción **objetivo**: ~70% unit, ~25% integration, ~5% E2E. Más tests E2E = más lentos = menos veces se ejecutan.

## Unit tests (Jest)

**Cobertura objetivo**:
- Domain services: 80%+
- Use cases: 80%+
- Controllers: NO se testean unitarios (van en integration)
- Utilities críticas (money math, date handling, RUC/RIF validators, EAN-13 checksum): **100%**

**Pattern obligatorio**: AAA (Arrange / Act / Assert), mocks SOLO para dependencias externas (SUNAT, payments). Lógica interna real.

## Integration tests (Jest + Supertest)

Por cada bounded context:
- Endpoint → BD real (PostgreSQL embedded en CI)
- Casos: happy path + auth fail + validation fail + tenant isolation + concurrent ops

**Multi-tenant isolation OBLIGATORIO**: cada test crea su propio tenant + cleanup. Test específico que verifica que tenant A NO ve datos de tenant B en cada endpoint.

## E2E tests (Playwright)

**Setup**: db reset + seed datos mínimos + login programático.

**Flujos cubiertos obligatoriamente**:

| # | Flujo | Vertical |
|---|---|---|
| 1 | Venta completa happy path bodega esquina (login → escanear 3 productos → cobro efectivo → vuelto → boleta) | Bodega |
| 2 | Venta minimarket multi-cajero (2 sesiones simultáneas, cada cajero su turno) | Minimarket |
| 3 | Venta mayorista con crédito (cliente con línea, descuento volumen aplicado) | Mayorista |
| 4 | Cierre de turno + arqueo de caja + diferencia reportada | Multi-cajero |
| 5 | Concurrencia stock: 2 ventas concurrentes último item → solo una procede, otra error claro | Crítico |
| 6 | SUNAT happy path: emisión boleta → CDR recibido → almacenado | PE |
| 7 | SUNAT rechazo: respuesta error → reintento → escalado humano si persiste | PE |
| 8 | SENIAT Venezuela: equivalente al de SUNAT | VE |
| 9 | Multi-país switch: admin cambia tenant PE↔VE, ve datos correctos | Multi-país |
| 10 | Reportes día/mes/sucursal con datos consistentes | Todos |
| 11 | Login fail: credenciales mal → account locked tras 5 intentos | Seguridad |
| 12 | Multi-tenant isolation: tenant A NO puede ver tenant B en NINGÚN endpoint | **Crítico** |
| 13 | Inputs maliciosos: SQLi, XSS, JSON malformed, JWT manipulado | Seguridad |

**Resoluciones**: 360px (móvil), 768px (tablet), 1280px (desktop).

## Visual regression

Páginas críticas (login, dashboard, POS de venta, reportes) con screenshots Playwright. Diferencia >2% pixels → fail.

## Validación de inputs (compartido con Security)

Por CADA endpoint que recibe input, validación testeada:

| Tipo | Tests obligatorios |
|---|---|
| Números (precios, cantidades) | "abc", "1e308", "-1", null, undefined, array |
| Fechas | "1900-01-01", "9999-12-31", "not-a-date", "2024-02-30" |
| Strings | `<script>`, `"; DROP TABLE--`, 10MB de "A", Unicode raro (RTL, zero-width) |
| RUC | formato + checksum válido/inválido por país |
| RIF | formato V/E/J/G + checksum |
| EAN-13 | checksum válido/inválido |
| JSON | depth 1000, keys duplicadas, prototype pollution (`__proto__`) |
| Files | doble extensión (.pdf.exe), polyglot files, ZIP bomb, mime spoofing |

## Performance tests (k6)

Activar cuando se acerque producción:
- POS bajo carga: **50 ventas/min sostenidas sin degradar**
- Reporte mensual con 10K transacciones: **<3 segundos**

## Triggers (cuándo correr cada suite)

| Trigger | Suite |
|---|---|
| Pre-commit (local, dev opcional) | Lint + tipos |
| On PR open | Unit + integration (afectados) |
| On PR push subsiguiente | Unit + integration (afectados) |
| Antes de merge | Unit completo + integration completo + E2E críticos (#1, #5, #6, #12) |
| Post-merge a main | E2E completo (los 13) |
| Cron daily 05:00 Lima | Smoke tests sobre HEAD (5 flujos más críticos) |

## Definición de "verde para merge"

Todos verdes:
- ✅ Build TypeScript (cero errores)
- ✅ Lint (cero warnings nuevos)
- ✅ Unit tests passing (≥80% en services nuevos)
- ✅ Integration tests passing
- ✅ E2E críticos passing (#1, #5, #6, #12 mínimo)
- ✅ Sin secretos commiteados (gitleaks)
- ✅ Multi-tenant isolation test passing para endpoints nuevos

## Flaky tests

Son **bugs**, no normalidad. Política:
- 1ª falla aleatoria: investigar inmediatamente
- 2ª falla: arreglar o borrar el test (no "rerun until pass")
- Tests flaky bloquean merge igual que tests rojos

## Tests faltantes hoy (estado real)

Auditoría del repo actual: **0 tests** detectados en `backend/` o `frontend/`. Esto bloquea cualquier merge según esta strategy.

**Acción inmediata** (cuando se reactive):
1. Setup Jest config en `backend/` + primer test unit de `assert-tenant.util.ts`
2. Setup Playwright en raíz + primer E2E del flujo #1 (venta happy path)
3. CI workflow en `.github/workflows/test.yml` que ejecute ambos
4. Política: cada PR nuevo debe traer al menos 1 test (unit o integration)

## Reportes QA

- **Por PR**: comentario en GitHub con resultado de cada suite + coverage delta
- **Semanal**: `docs/qa/report-YYYY-MM-DD.md` con: tests añadidos, coverage actual, flaky detectados, performance trends
