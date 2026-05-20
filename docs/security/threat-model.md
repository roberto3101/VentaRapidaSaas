# Threat Model — SistemaVentaRapida Pro

- **Status**: Baseline v1
- **Owner**: Security Hacker agent
- **Date**: 2026-05-20
- **Framework**: STRIDE + OWASP Top 10 2026 + OWASP API Security Top 10
- **Referencias**: ADR-001 (multi-tenancy), ADR-003 (fiscal hexagonal), ADR-006 (auth), skill `09-security-hacker.md`

> Modelo de amenazas inicial. Define qué assets defendemos, contra quién, con qué controles. Updateable trimestralmente o al añadir nuevo bounded context.

## Assets a proteger (priorizados)

| # | Asset | Por qué importa | Impacto si compromete |
|---|---|---|---|
| 1 | **Datos de ventas multi-tenant** | Cada tenant es un negocio cuya facturación NO debe ser vista por otros | Pérdida de confianza, demanda, GDPR/Ley protección datos PE |
| 2 | **Certificados digitales SUNAT/SENIAT** de clientes | Permite emitir comprobantes a nombre del cliente. Robo = fraude fiscal | Penal grave para cliente y para nosotros |
| 3 | **Credenciales de cajeros** | Acceso al POS = ventas fraudulentas | Robo, modificación stock |
| 4 | **Stock e inventario** | Manipulación = robo encubierto | Pérdida económica directa |
| 5 | **Logs de auditoría** | Borrarlos = ocultar fraude | Imposibilidad de detectar incidentes |
| 6 | **Datos personales clientes** | DNI, RUC, RIF, teléfono, email | Ley 29733 PE / habeas data VE |
| 7 | **Pricing y descuentos** | Manipulación = venta a precio cero | Pérdida económica |

## Actores de amenaza

| Actor | Capacidad | Motivación |
|---|---|---|
| **Cajero malicioso interno** | Acceso legítimo al POS, conoce flujos | Robo encubierto, favores a amigos |
| **Atacante externo opportunista** | Scans automatizados, scripts comunes | Defacement, ransomware, robo creds |
| **Atacante externo dirigido** | Skill alto, persistente | Robo masivo datos para vender, espionaje competidor |
| **Otro tenant** | Cuenta legítima en el sistema | Curiosidad, espionaje competencia |
| **Ex-empleado** | Conoce arquitectura, posiblemente credenciales viejas | Venganza, sabotaje |

## STRIDE por componente

### Backend API

| Amenaza | Mitigación |
|---|---|
| **S**poofing | JWT con expiración corta (15 min access + refresh 7d), refresh rotation |
| **T**ampering | Firma JWT con HS256 (key 256+ bits) o RS256 (RSA 2048+) |
| **R**epudiation | Audit log inmutable de cada operación crítica (venta, anular, modificar stock) |
| **I**nformation disclosure | Multi-tenant RLS PostgreSQL (ADR-001), responses sin stack traces en producción |
| **D**enial of service | Rate limiting global (Nest Throttler) + per-endpoint en login/recovery |
| **E**levation of privilege | RBAC con roles cerrados (ADR-006), guards en cada endpoint |

### Frontend

| Amenaza | Mitigación |
|---|---|
| XSS | React por default escapa. Banned: `dangerouslySetInnerHTML` salvo casos justificados |
| CSRF | SameSite=Lax/Strict en cookies, double-submit token en mutaciones |
| Tokens en localStorage | NO — tokens en httpOnly cookies (backend setea) |
| Clickjacking | Header `X-Frame-Options: DENY` o CSP `frame-ancestors 'none'` |

### Base de datos

| Amenaza | Mitigación |
|---|---|
| SQL injection | Prisma parametrizado siempre. Ban `$executeRawUnsafe` con strings interpolados |
| Acceso directo desde fuera | Postgres NO expuesto a internet. Solo accesible desde backend (VPC) |
| Backup robado | Backups encriptados en reposo (AES-256), key separada |
| Cross-tenant leak | RLS PostgreSQL + middleware app (ADR-001) — defense in depth |

### SUNAT/SENIAT integración

| Amenaza | Mitigación |
|---|---|
| Robo de certificado digital | Certificado nunca en el repo. Vault separado (HashiCorp Vault o equivalente cloud). Acceso vía role assumption |
| Tampering de comprobante en tránsito | TLS 1.3 hacia endpoint SUNAT/SENIAT, validación de cert peer |
| Replay de comprobante | Número de serie único por tenant+tipo+serie. Constraint UNIQUE en BD |
| Pérdida de comprobantes enviados pero sin CDR | Queue persistente (BullMQ + Redis), reintentos exponenciales, dashboard de pendientes |

## OWASP Top 10 2026 — checklist

| ID | Categoría | Status actual | Acción |
|---|---|---|---|
| A01 | Broken Access Control | ⚠️ PARCIAL | Tests multi-tenant + RBAC pendientes |
| A02 | Cryptographic Failures | ⚠️ REVISAR | Verificar bcrypt cost ≥12, JWT secret strength, TLS only |
| A03 | Injection | 🔴 **CRÍTICO** | `$executeRawUnsafe` debe eliminarse (SIS-CRITICAL-2) |
| A04 | Insecure Design | ⚠️ EN PROCESO | ADRs documentan diseño seguro, falta auditarlos contra implementación |
| A05 | Security Misconfiguration | ⚠️ REVISAR | Helmet en Nest, CORS estricto, headers de seguridad |
| A06 | Vulnerable Components | ⚠️ AUTO | `pnpm audit` en cada PR vía CI |
| A07 | Identification & Auth Failures | ⚠️ REVISAR | Account lockout pendiente, MFA opcional para admin |
| A08 | Software & Data Integrity | ⚠️ REVISAR | Signed commits opcionales, SRI si se sirve frontend desde CDN externo |
| A09 | Logging & Monitoring | 🔴 PENDIENTE | No hay correlation ID, no hay log centralizado |
| A10 | SSRF | N/A hoy | Aplica cuando se acepten URLs de upload o webhooks salientes |

## OWASP API Security Top 10

| ID | Status |
|---|---|
| API1 Broken Object Level Authorization | ⚠️ Tests multi-tenant pendientes |
| API2 Broken Authentication | ⚠️ Account lockout pendiente |
| API3 Broken Object Property Level Authorization | ⚠️ Mass assignment — verificar DTOs con `whitelist: true` |
| API4 Unrestricted Resource Consumption | ⚠️ Rate limit + max body size |
| API5 Broken Function Level Authorization | ⚠️ Guards por endpoint pendientes |
| API6 Unrestricted Access to Sensitive Business Flows | ⚠️ Cobros, anulaciones — gate humano para casos high-value |
| API7 SSRF | N/A hoy |
| API8 Security Misconfiguration | ⚠️ Helmet + CORS pendientes |
| API9 Improper Inventory Management | ⚠️ Documentar API en OpenAPI con versiones |
| API10 Unsafe Consumption of APIs | ⚠️ Validar respuestas de SUNAT/SENIAT antes de procesar |

## Específicos POS / SUNAT

| Amenaza | Mitigación |
|---|---|
| Cajero anula venta sin permiso | Anulación requiere rol `branch_manager`+ password 2nd factor + audit log inmutable |
| Cajero modifica precio en venta | Cambios de precio requieren rol superior + audit log |
| Robo desde turno (caja menos efectivo del esperado) | Arqueo obligatorio al cerrar turno, diferencia reportada al manager |
| Tampering de XML SUNAT | Firma digital con certificado cliente, hash de contenido en audit |
| Bypass de auditoría | `audit_logs` con trigger BD que rechaza UPDATE/DELETE (append-only) |

## Inputs adversariales (compartido con QA)

Por cada input del sistema, se intentan estos vectores como tests automatizados:

- **Numbers**: `"abc"`, `"1e308"`, `"-1"`, `null`, `undefined`, array, infinity
- **Dates**: `"1900-01-01"`, `"9999-12-31"`, `"not-a-date"`, `"2024-02-30"`, milliseconds vs seconds confusion
- **Strings**: `<script>`, `"; DROP TABLE--`, 10MB "A", Unicode RTL override, zero-width chars
- **IDs**: IDs de otro tenant, IDs inexistentes, path traversal (`../../etc/passwd`), UUID vs cuid confusion
- **JSON**: depth 1000, keys duplicadas, prototype pollution (`__proto__`, `constructor`)
- **Files**: doble extensión (`.pdf.exe`), polyglot files, ZIP bomb, mime type spoofing, magic bytes mismatch

## Compliance

| Norma | País | Estado |
|---|---|---|
| Ley 29733 — Protección de datos personales | PE | Pendiente DPO designado, registro de tratamientos, ARCO rights workflow |
| Resolución 128-2021/SUNAT — Facturación electrónica | PE | Cumplimiento via integración propia, validar XSD por cada release |
| Ley Especial contra Delitos Informáticos | VE | Revisar Art. 6 (acceso indebido) y Art. 9 (sabotaje informático) |
| Ley Orgánica de Protección de Datos | VE | Pendiente análisis con asesor legal local |

## Plan de respuesta a incidentes

1. **Detección**: alerta automática (logs, monitoring) o reporte humano
2. **Triage** (≤30 min): severidad CVSS, alcance (tenants afectados), impacto
3. **Contención**: pausar endpoint afectado, rotar credenciales si aplica, snapshot BD
4. **Erradicación**: deploy fix + verificación
5. **Recovery**: restaurar servicio, notificar afectados según severidad
6. **Postmortem** (≤7 días): documento en `docs/security/incidents/YYYY-MM-DD-{slug}.md` (Blameless)

## Hallazgos críticos abiertos (auditoría 2026-05-20)

| # | Hallazgo | CVSS estimado | Issue |
|---|---|---|---|
| 1 | `$executeRawUnsafe` con interpolación de UUID en middleware tenant | **8.1 High** (potencial SQL injection si UUID no validado) | SIS-CRITICAL-2 |
| 2 | `auth.service.ts:30` login global sin `tenantId` | **7.5 High** (cross-tenant takeover potencial) | SIS-CRITICAL-1 |
| 3 | Sin tests de aislamiento multi-tenant | **6.5 Medium** (riesgo de regresión) | SIS-HIGH-7 |
| 4 | Sin rate limit en login | **5.3 Medium** (brute force) | SIS-HIGH-X |
| 5 | Headers de seguridad ausentes (Helmet) | **4.3 Medium** | SIS-MED-X |

## Cron scans (cuando se reactive)

- **Diario 02:00 Lima**: `pnpm audit` + `gitleaks` + `semgrep --config auto` sobre diff últimas 24h
- **Semanal lunes 03:00 Lima**: full SAST + DAST baseline (OWASP ZAP) + fuzz inputs principales endpoints
