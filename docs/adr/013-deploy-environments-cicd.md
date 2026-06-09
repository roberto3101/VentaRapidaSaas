# ADR-013: Deploy, ambientes, secrets y CI/CD

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-53

## Context

CLAUDE.md raíz exige:

- "Migraciones zero-downtime obligatorias (add column nullable → backfill → not null en sig migración)"
- "Health checks por servicio: `/health/live` (k8s liveness), `/health/ready` (readiness)"
- "Graceful shutdown obligatorio"
- "Versionado API estricto (`v1`, `v2` en paralelo durante migraciones)"

Pero NO hay decisión documentada sobre:

- **Hosting**: ¿Vercel? ¿Railway? ¿Render? ¿VPS? ¿AWS?
- **DB**: ¿Supabase? ¿Neon? ¿RDS? ¿Self-hosted? El root menciona "$100/mes inicial" → debe ser cheap.
- **CI/CD**: GitHub Actions parece obvio (repo en GitHub) pero sin pipeline definido.
- **Secrets management**: ADR-012 dice "MVP usa env var, después KMS". OK ¿pero dónde están los env vars y quién rota?
- **Multi-país**: ¿una instancia para PE+VE o instancia por país?
- **Migraciones Prisma**: ¿auto en deploy? ¿manual? ¿bloqueante?
- **Feature flags**: ¿necesarias? ¿librería?
- **Promociones**: ¿auto-deploy a prod desde main o manual gate?
- **Rollback**: ¿estrategia si una migration revienta?

Hoy: cualquier deploy se hace manual local. No hay staging. Producción no existe aún.

## Decision

### 1. Ambientes — 3 niveles + ephemeral previews

| Ambiente | Cuándo | Para qué |
|---|---|---|
| `local` | Dev laptop | `pnpm dev` cada quien con su Docker Compose (Postgres) |
| `preview` | Cada PR a main | Branch deploy efímero, BD ephemeral por PR (Neon branch o Supabase preview). Se destruye al merge/close. |
| `staging` | Auto en cada merge a main | Replica fiel de prod (mismo hosting, BD aparte). Para QA + smoke tests. |
| `production` | Manual promote desde staging (botón GitHub Actions) | Real. SLO aplicable. |

**Nada se va a producción sin pasar por staging.** Promote requiere aprobación de un humano en GH Actions environment con required reviewer.

### 2. Hosting — Railway por simplicidad MVP, plan de migración cuando escale

**MVP (0-100 tenants, hasta ~$10k MRR):**

- **Backend NestJS**: **Railway** (Docker o Nixpacks, escala vertical fácil, env vars + secrets manejados, deploys desde GH).
- **Microservicio fiscal PHP (Greenter)**: **Railway** como servicio separado en el mismo proyecto (red privada interna entre servicios, sin exposición pública). Dockerfile PHP 8.2 + extensiones `soap`, `zlib`, `openssl`, `curl` per [[012-sunat-production-hardening]] §2. Punto de partida: [Lycet](https://github.com/giansalex/lycet) (REST API basada en Greenter + Symfony, Docker-ready).
- **Frontend Next 16**: **Vercel** (App Router native, edge runtime, ISR/SSR optimal).
- **PostgreSQL**: **Neon** (serverless, branching para previews, PITR 7 días free / 30 días paid, scale-to-zero en preview branches).
- **Object storage** (CDRs, certs encriptados archivados, logos tenant): **Cloudflare R2** (sin egress fees, S3-compatible API).
- **Email transaccional**: **Resend** (DX limpia, gratis hasta 3k/mes, después barato).

Costo estimado MVP: ~$70-100/mes (Railway hobby para 2 servicios + Neon starter, Vercel hobby, R2 free tier, Resend free). El servicio PHP idle pesa ~30MB RAM y solo despierta en emisiones — bajo costo.

**Fase 2 (>10k MRR o problema real con Railway):**

- Backend → **Fly.io** o **Render** (multi-región fácil) o AWS ECS si compliance lo exige.
- DB → **AWS RDS Postgres** multi-AZ o **Supabase paid**.
- KMS → **AWS KMS** real (cierra el `TODO` de [[012-sunat-production-hardening]]).

Esta migración no requiere reescribir nada — solo cambiar Dockerfile/env. Por eso elegimos hoy plataformas con bajo lock-in.

### 3. Multi-país — **una sola instancia**, multi-tenant por discriminator

[[001-multi-tenancy-strategy]] ya implica una sola BD multi-tenant. Aquí confirmamos: **una sola instancia de backend** sirve a PE + VE (y futuros). No `backend-pe` + `backend-ve` separados.

- Razón: complejidad operacional por país no se justifica hasta tener >>100 tenants por país.
- Latencia: backend en US-East (Railway). Latencia desde Lima ~80ms, desde Caracas ~120ms. Aceptable para POS (operaciones <500ms percibidas).
- Cuando una región justifique edge presence (ej. Perú con muchos tenants y reportes pesados), agregamos read replica regional con Neon read-only branches.

### 4. Secrets — jerarquía y rotación

| Tipo | Dónde vive | Quién accede | Rotación |
|---|---|---|---|
| **Plataforma** (DB url, Redis, JWT secret, Resend key, etc.) | Railway/Vercel env vars (encriptados at-rest, no en repo) | Backend en runtime | Manual cada 90 días o on suspicion |
| **Cert master key** (cifra `.pfx` tenant per [[012]]) | Railway secret manager (var `CERT_MASTER_KEY`) | Solo `SunatFiscalEmitterAdapter` | Solo con re-cifrado masivo de todos los `tenant_certificates`. Por eso se rota MUY poco. |
| **Per-tenant secrets** (`.pfx`, passphrase, API keys de adquirentes) | BD cifrada con `CERT_MASTER_KEY` | Solo adapters específicos en runtime | Cada vez que el tenant lo cambie |

**Reglas**:

- Cero secrets en git. Cero secrets en `.env` commiteado.
- `.env.example` (con valores dummy) sí va en git.
- Local dev: cada quien tiene su `.env.local` (gitignored).
- CI: usa GH Actions secrets, accesibles solo en runners protegidos del repo.
- **Auditoría**: cada acceso a `CERT_MASTER_KEY` se loguea (`audit_logs.action = 'cert_decrypt'`).

### 5. CI/CD — GitHub Actions, pipeline por capa

**Workflow `.github/workflows/ci.yml` (en cada push y PR):**

```yaml
1. lint              (eslint, prettier --check en backend+frontend; php-cs-fixer en fiscal-php/)
2. typecheck         (tsc --noEmit en backend y frontend; phpstan level 6 en fiscal-php/)
3. arch-lint         (custom rule de [[008]] — falla si import cruza capas)
4. test-unit         (jest backend, vitest frontend, phpunit fiscal-php/)
5. test-integration  (jest con Postgres en contenedor; phpunit con SUNAT sandbox dryrun)
6. prisma-validate   (prisma migrate diff contra main)
7. build             (nest build + next build + docker build fiscal-php/)
```

**Workflow `.github/workflows/deploy-staging.yml` (en push a main):**

```yaml
1. esperar a ci.yml verde
2. ejecutar prisma migrate deploy contra staging DB
3. push imagen a Railway staging service
4. push a Vercel preview (auto)
5. smoke tests E2E (Playwright contra staging URL)
6. notificar a Slack si verde
```

**Workflow `.github/workflows/deploy-production.yml` (manual `workflow_dispatch`):**

```yaml
required-reviewers: [roberto3101]
1. tag de release (semver)
2. prisma migrate deploy contra prod DB
3. push imagen a Railway prod service (rolling deploy, max 1 instance down)
4. push a Vercel prod
5. smoke tests E2E contra prod
6. rollback automático si smoke falla
```

### 6. Migraciones Prisma — zero-downtime, aditivas, gate de seguridad

Reglas (refuerzan CLAUDE.md raíz):

1. **Solo aditivas** en un deploy: add column nullable, add table, add index CONCURRENTLY, add enum value.
2. **Drop** en deploy posterior: una vez verificado que no hay código usando.
3. **Rename**: nunca. Crear nueva columna + backfill + dual write + cambiar reads + drop vieja, en 4 deploys distintos.
4. **NOT NULL**: agregar como nullable + backfill + en siguiente deploy `NOT NULL` con default.
5. **CI gate**: script `tools/migration-safety/` analiza el diff y rechaza patrones peligrosos (`DROP COLUMN`, `RENAME`, `ALTER TYPE` sin USING). Override requiere comentario `-- allow-unsafe: <razón>` y reviewer extra.
6. **Migration timeout**: 60s. Si una migration tarda más, se aborta. Cambios grandes requieren `CREATE INDEX CONCURRENTLY` o un job de backfill aparte (no en migration).

### 7. Feature flags — opt-in simple

- **MVP**: env vars (`FEATURE_SUNAT_REAL=true`, `FEATURE_STORE_CREDIT=false`). Lectura central en `config/features.ts`.
- **Por tenant**: campo `Tenant.featureFlags (jsonb)` para overrides puntuales — útil para beta-testing un módulo con 5 tenants antes de lanzar a todos.
- **Cuando JSON crezca >20 flags**: migrar a LaunchDarkly o GrowthBook self-hosted. NO antes (YAGNI).

### 8. Observabilidad de deploy

- Cada deploy emite un evento `deploy.completed` con SHA, autor, timestamp → loggeado y mostrado en `/internal/deploys` (página interna staff-only).
- Sentry release tags + source maps subidos automático.
- **Marker en métricas** (Grafana annotation) en cada deploy para correlacionar con cambios de comportamiento. Ver [[016-observability]].

### 9. Rollback — siempre disponible

- **Backend**: Railway mantiene última imagen funcional. `railway rollback` revierte en <30s.
- **Frontend**: Vercel "Promote" del deploy anterior, <10s.
- **DB**: rollback de migration **NO** se hace en automático (riesgo de pérdida de datos). Si una migration rompió algo:
  - Si fue aditiva → app revertido sigue funcionando con la columna nueva (ignorada).
  - Si requirió cambio destructivo → forward fix con nueva migration que corrige. **Nunca** `DROP` para "limpiar".
- Playbook documentado en `docs/runbooks/rollback.md` (a crear).

## Consequences

- ✅ MVP corre por ~$70/mes con DX moderna (preview branches, edge frontend, serverless DB).
- ✅ Promote a prod tiene gate humano → evita despliegues accidentales.
- ✅ Zero-downtime real gracias a migraciones aditivas + arch-lint del CI.
- ✅ Rollback rápido en backend y frontend.
- ✅ Plan de escala claro: Railway → Fly/AWS sin reescribir.
- ⚠️ Neon free tier tiene límites (compute time, storage). Migrar a paid (~$20/mes) cuando llegue primer tenant productivo real.
- ⚠️ Smoke tests en prod consumen llamadas SUNAT sandbox — usar adapter `dryrun` para no contar contra cuotas.
- 🔓 Riesgo abierto: KMS real ([[012]]) sigue pendiente. Aceptado hasta ~$10k MRR.
- 🔓 Riesgo abierto: multi-región (si tenants en CL/AR/MX) tendrá latencia notable desde US-East. Plan: edge functions Vercel + read replicas Neon. Decisión cuando aparezca el primer cliente.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. AWS ECS + RDS desde día 1 | Overhead operacional alto, costo mensual ~5x Railway. Para MVP, overkill. |
| B. Docker Compose en VPS (Hetzner) | Más barato pero requiere gestionar TÚ backups, certs, monitoreo, scaling. No vale el ahorro. |
| C. Vercel para backend también (serverless functions) | NestJS no encaja bien en serverless cold-start. Para POS necesitamos latencia consistente. |
| D. Auto-deploy a prod desde main (sin gate humano) | Producción con SUNAT real no perdona despliegues "ups, no era". Gate es barato y vale oro. |
| E. Branch por país (`main-pe`, `main-ve`) | Divergencia, deploy doble, drift. La data-driven strategy de [[002]] permite una sola main. |
| F. Sin staging (PR previews → prod) | Smoke tests + E2E no se pueden correr en PR ephemerals contra SUNAT sandbox real. Necesitamos staging estable. |

## Implementation plan

1. Setup proyecto Railway (backend) + Vercel (frontend) + Neon (DB) — Architect + Roberto, SIS-XX.
2. `.github/workflows/ci.yml` con lint/typecheck/test/build (DBA + Backend Dev).
3. `.github/workflows/deploy-staging.yml` (Backend Dev).
4. `.github/workflows/deploy-production.yml` con required reviewer (Backend Dev).
5. `tools/migration-safety/` linter de migrations (DBA).
6. Documentar `docs/runbooks/{deploy, rollback, secret-rotation}.md` (Architect).
7. Sentry + source maps integrados (Backend Dev + Frontend Dev).
8. Primer deploy a staging y smoke E2E (QA).

## References

- [[001-multi-tenancy-strategy]] · [[002-multi-country-strategy]] · [[008-clean-architecture-layers]] · [[012-sunat-production-hardening]] · [[016-observability]]
- Railway docs: https://docs.railway.app/
- Neon branching: https://neon.tech/docs/introduction/branching
- Prisma migrate deploy: https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
