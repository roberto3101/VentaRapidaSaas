# ADR-016: Observabilidad — logs, métricas, traces, audit log y alertas

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-56

## Context

CLAUDE.md raíz menciona:

- "Logs estructurados con correlation ID (request-id propagado entre contexts)"
- "Health checks por servicio: `/health/live`, `/health/ready`"
- "Graceful shutdown obligatorio"

[[006-auth-and-rbac]] menciona `AuditLog`. Pero no hay decisión documentada sobre:

- **Logging**: librería, formato, level, retention, aggregator.
- **Metrics**: qué se mide, exportador, backend, dashboards.
- **Tracing**: ¿OpenTelemetry? ¿sampling? ¿exporter?
- **Audit log**: qué eventos, schema, append-only, retention.
- **Alerting**: qué dispara alerta, dónde llega, on-call.
- **Error tracking**: Sentry vs alternativas, source maps, PII scrubbing.
- **Cost**: el stack puede explotar fácil — necesita budget cap.

Sin observabilidad, debuggear un bug fiscal en producción es ciego, y un incidente de seguridad pasa desapercibido.

## Decision

### 1. Logging — Pino + structured JSON + correlation ID

- **Librería**: `pino` (más rápido que winston, JSON nativo, ecosistema NestJS via `nestjs-pino`).
- **Formato**: JSON estructurado. Cada log line incluye:
  - `timestamp` (ISO8601 con ms)
  - `level` (`fatal|error|warn|info|debug|trace`)
  - `requestId` (UUID v4 generado en middleware, propagado en `cls-hooked` / `AsyncLocalStorage`)
  - `tenantId`, `userId` (si aplica)
  - `module` (bounded context: `sales`, `inventory`, ...)
  - `msg` (texto humano)
  - campos custom
- **Levels por ambiente**: prod `info`, staging `debug`, local `trace`.
- **PII scrubbing**: helper `scrub()` que enmascara `email`, `documentNumber`, `password`, `pfxPassphrase` antes de loggear. Logs jamás contienen credenciales o cert keys (regla ESLint custom para detectar `logger.*(...password...)` etc.).
- **Sin `console.log`** en código de producción. Lint rule bloquea.

### 2. Aggregator — Axiom (managed, cheap)

- **Axiom** (https://axiom.co): tier gratuito 500GB/mes, integración Pino directa via `@axiomhq/pino`.
- Razón vs alternativas:
  - **Logflare / Better Stack**: similar costo, Axiom tiene mejor query UX (APL syntax).
  - **Self-hosted Loki/Grafana**: requiere VPS + mantenimiento. No vale para MVP.
  - **Datadog**: ~10x más caro, overkill para early stage.
- **Retention**: 30 días hot en Axiom + dump mensual a R2 cold (extensión del job de [[014]]).
- **Dashboards**: por bounded context (sales errors, inventory rejections, auth failures, fiscal emission status).

### 3. Metrics — prom-client + Grafana Cloud free tier

- **Backend**: `prom-client` expone `/metrics` (scrape endpoint Prometheus, protegido con basic auth).
- **Métricas obligatorias** (todas con label `tenantId` salvo agregados de plataforma):

| Tipo | Métrica | Por qué importa |
|---|---|---|
| Counter | `http_requests_total{method, route, status}` | Health general |
| Histogram | `http_request_duration_seconds{route}` | SLO latencia |
| Counter | `sales_completed_total{locationId}` | Volumen de negocio |
| Histogram | `sale_transaction_duration_seconds` | Performance del crítico path |
| Counter | `sale_failures_total{reason}` | Calidad del crítico path |
| Counter | `receipt_emission_total{type, status}` | Fiscal health |
| Histogram | `receipt_emission_duration_seconds{adapter}` | Performance SUNAT |
| Counter | `receipt_emission_pending_total` | Cola de comprobantes atascados |
| Counter | `cash_shift_diff_total{severity}` | Anomalías arqueo |
| Gauge | `db_connection_pool_in_use` | Saturación DB |
| Gauge | `outbox_pending_count` | Backlog de eventos |
| Counter | `auth_login_total{result}` | Detectar credential stuffing |

- **Backend**: Grafana Cloud free tier (10k series). Suficiente MVP.
- **Dashboards as code**: `tools/observability/grafana/*.json` en repo. Sync via GH Action.
- **SLOs definidos**:
  - p95 latencia `POST /sales` < 800ms.
  - Tasa éxito emisión SUNAT > 99% en ventana 1h.
  - p95 latencia `GET /products` < 200ms.

### 4. Tracing — OpenTelemetry + Tempo (sampling 10%)

- **SDK**: `@opentelemetry/sdk-node` + auto-instrumentations (`http`, `pg`, `nestjs-core`).
- **Exporter**: OTLP gRPC → **Grafana Tempo** (free tier en Grafana Cloud).
- **Sampling**: 10% por defecto, **100% para traces de errores** (head-based sampling + tail-based para errores via collector).
- **Custom spans** en código crítico: `tracer.startActiveSpan('emit-fiscal-receipt', ...)`.
- **Trace ↔ Log correlation**: `traceId` y `spanId` se inyectan automáticamente en cada log de Pino — un click va de log a trace en Grafana.
- **Reglas**: nunca incluir PII en atributos de spans. Tampoco passwords.

### 5. Audit log — append-only, business events

Distinto de logs operacionales — el audit log es para **eventos de negocio sensibles**, consumido por contadores y reguladores.

**Schema**:

```
audit_logs:
  id (uuid)
  tenant_id (NULL para eventos plataforma)
  actor_user_id (NULL si sistema)
  actor_role (snapshot)
  impersonated_by (NULL salvo si super_admin impersonó — per [[015]])
  action (text, enum)
  entity_type (text)
  entity_id (uuid, nullable)
  before_snapshot (jsonb, nullable)
  after_snapshot (jsonb, nullable)
  metadata (jsonb)         -- IP, user agent, extra context
  occurred_at (timestamptz)
  request_id (uuid)        -- ata al log line correlacionado
```

**Eventos obligatoriamente auditados**:

- Auth: `login_success`, `login_failure`, `password_reset`, `2fa_enabled`, `2fa_disabled`.
- User mgmt: `user_created`, `user_role_changed`, `user_disabled`, `user_branch_assigned`.
- Fiscal: `cert_uploaded`, `cert_rotated`, `cert_decrypt` (cada vez), `fiscal_mode_changed`, `receipt_voided`.
- Sales: `sale_voided`, `return_created`, `return_approved`, `cash_shift_diff_approved`.
- Tenant: `tenant_status_changed`, `tenant_settings_changed`, `impersonation_started`, `impersonation_ended`.
- Data: `customer_data_anonymized`, `data_exported`, `data_deletion_requested`.

**Reglas**:

- **Append-only**: trigger Postgres bloquea `UPDATE` y `DELETE` salvo por `super_admin` con flag de excepción (caso PII deletion).
- **Retention**: 5 años (igual que comprobantes — auditoría fiscal).
- **Inmutable**: una vez archivado a cold storage post-2 años, queda en R2 con Object Lock.
- **Lectura**: endpoint `GET /audit-logs?...filters` solo `tenant_admin` y superior, paginado.
- **Export**: tenant_admin puede exportar audit log de su tenant a CSV/JSON (para su contador o auditoría externa).

### 6. Error tracking — Sentry

- **Sentry** SaaS (free tier 5k errors/mes — suficiente MVP).
- Instrumentación: SDK en backend (`@sentry/nestjs`) y frontend (`@sentry/nextjs`).
- **Release tags + source maps**: upload automático en deploy (per [[013]] §8).
- **PII scrubbing on the wire**: lista de keys a redact (`password`, `accessToken`, `documentNumber`, `pfxPassphrase`, `creditCard`).
- **Issue grouping** por fingerprint custom para errores fiscales (`receipt_emission.<errorCode>`).
- **Sentry alerts**: dispara cuando aparece nuevo error en prod (no en staging) o cuando un error supera 50 events en 1h.

### 7. Health checks — diferenciados

- **`GET /health/live`** (k8s liveness, también Railway healthcheck):
  - Solo verifica que el proceso está vivo y respondiendo. Retorna 200 siempre que el event loop no esté bloqueado.
  - **NO** chequea DB, Redis, SUNAT — si esos fallan, el proceso sigue vivo (puede servir cached, puede esperar a que vuelvan).
- **`GET /health/ready`** (k8s readiness):
  - Verifica conectividad DB (`SELECT 1` con timeout 1s), Outbox lag < 1000, cache de cert puede descifrar.
  - Si falla → el LB deja de enviar tráfico hasta que se recupere.
- Ambos: respuesta JSON con detalle por check (útil para debug).

### 8. Alerting — solo lo que duele

Filosofía: **una alerta = alguien debe actuar AHORA**. Si no, es dashboard, no alerta.

**Alertas (Grafana Alerts → Slack + email):**

- `error_rate_sustained`: errors/min > 10 por 5 min en prod.
- `sale_failure_spike`: `sale_failures_total` aumenta >5× promedio 1h.
- `receipt_pending_backlog`: `receipt_emission_pending_total` > 100 por >15 min.
- `db_connection_saturation`: pool in_use > 80% por 5 min.
- `auth_brute_force`: `auth_login_total{result="failure"}` > 100 en 1 min (mismo IP via label).
- `disk_space_low`: <20% libre en cualquier volumen.
- `cert_expiring_soon`: cert tenant a vencer en <14 días (job diario).
- `backup_failed`: job nocturno [[014]] no completó.

**Severity tiers**:

- `critical`: page on-call (PagerDuty MVP via email, real PagerDuty fase 2).
- `warning`: Slack channel `#alerts`.
- `info`: dashboard only.

### 9. Cost cap

- Axiom 500GB/mes → free. Si excede → drop logs `debug` automático.
- Grafana Cloud free tier → 10k series + 50GB logs + 50GB traces. Si excede → drop low-cardinality labels.
- Sentry 5k errors/mes → free. Si excede → rate-limit en SDK.
- Total presupuesto observabilidad MVP: $0. Fase 2: $50-100/mes cuando volumen real lo justifique.

## Consequences

- ✅ Debuggear bug en prod tiene log + trace + métricas correlacionados por `requestId`.
- ✅ Compliance fiscal con audit log inmutable 5 años.
- ✅ Alertas apuntan a problemas reales, no ruido.
- ✅ Stack 100% free tier en MVP — sin sorpresas de bill.
- ⚠️ Axiom/Grafana/Sentry son 3 vendors → 3 logins, 3 SDKs. Para MVP aceptable.
- ⚠️ PII scrubbing es disciplina — un campo nuevo que olvide ser scrubbeado expone data. Mitigación: tests + revisión PR.
- 🔓 Riesgo abierto: alerta fatiga si los thresholds son malos. Mitigación: tunear durante primer mes con tenants reales.
- 🔓 Riesgo abierto: trace sampling 10% pierde el 90% de los traces — para issues que no son errores, pueden faltar datos. Mitigación: tail-based sampling para retener traces "interesantes" (slow + errored).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Datadog full-stack | $$$, ~10× presupuesto. Reservar para enterprise. |
| B. Self-hosted ELK (Elasticsearch + Logstash + Kibana) | Requiere ops dedicado. Para 1 dev: no. |
| C. Audit log dentro de logs Pino (sin tabla dedicada) | Mezcla operacional con compliance. Difícil cumplir retention legal y query auditable. |
| D. Sampling 100% en traces | $$ Grafana Cloud. 10% + tail-based para errores es buen balance. |
| E. Sin alertas, solo dashboards | Owner no vive en dashboards 24/7. Alertas críticas son las que despiertan. |
| F. winston en vez de pino | Más lento (perf medible en 5-10% bajo carga). Sin razón para usarlo. |
| G. Console.log + grep en logs Railway | "Funciona" hasta el primer incidente. Inviable para auditoría fiscal. |

## Implementation plan

1. `nestjs-pino` + middleware `RequestIdMiddleware` + AsyncLocalStorage (Backend Dev, SIS-XX).
2. Tabla `audit_logs` + trigger append-only + helper `auditLog.record(...)` (DBA + Backend Dev).
3. Helpers de PII scrub + lint rule `no-pii-in-logs` (Backend Dev + Security).
4. Endpoints `/health/live` + `/health/ready` (Backend Dev).
5. `prom-client` con métricas listadas + `/metrics` (Backend Dev).
6. Setup Axiom + Grafana Cloud + Sentry projects (Roberto).
7. Dashboards iniciales JSON en `tools/observability/grafana/` (Architect + DBA).
8. Alert rules JSON con thresholds (Architect).
9. OpenTelemetry SDK + exporter Tempo (Backend Dev).
10. Migrar todos los `console.log` actuales a `logger.*` (Backend Dev).

## References

- [[006-auth-and-rbac]] · [[009-cash-shifts]] · [[011-returns-and-credit-notes]] · [[012-sunat-production-hardening]] · [[013-deploy-environments-cicd]] · [[014-backup-restore-dr]] · [[015-tenant-onboarding]]
- Pino: https://getpino.io/
- Axiom: https://axiom.co/docs
- OpenTelemetry JS: https://opentelemetry.io/docs/instrumentation/js/
- Grafana Cloud: https://grafana.com/products/cloud/
- Sentry NestJS: https://docs.sentry.io/platforms/javascript/guides/nestjs/
