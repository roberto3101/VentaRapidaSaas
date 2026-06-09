# ADR-014: Backup, restore y disaster recovery

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-54

## Context

Un POS con datos fiscales tiene tres riesgos asimétricos:

1. **Pérdida de transacciones del día** → cliente pierde dinero real, queda mal con cliente final.
2. **Pérdida de comprobantes fiscales** → ilegal. SUNAT exige 5 años de retención de XML+CDR. La multa puede acabar el negocio.
3. **Caída prolongada** → cliente no puede vender. Pérdida de ingresos directa + reputacional.

[[013-deploy-environments-cicd]] decidió Neon como Postgres managed. Neon incluye PITR (point-in-time recovery) 7 días free / 30 días paid. **No es suficiente para fiscal**.

Falta decidir:

- **RPO** (Recovery Point Objective): ¿cuánta data podemos perder?
- **RTO** (Recovery Time Objective): ¿en cuánto tiempo volvemos a operar?
- **Retención**: días en hot backup, meses en cold, qué se conserva 5 años.
- **Restore drills**: ¿practicamos restaurar? ¿cada cuánto?
- **Multi-región**: ¿necesitamos copia en región distinta?
- **Datos no-DB**: object storage (R2) con CDRs y certs cifrados — su propia estrategia.

## Decision

### 1. Objetivos formales

| Métrica | Valor MVP | Valor fase 2 |
|---|---|---|
| **RPO hot** (datos críticos: ventas, comprobantes) | ≤ 5 minutos | ≤ 1 minuto |
| **RPO cold** (todo el resto) | ≤ 24 horas | ≤ 4 horas |
| **RTO** (volver a operar tras pérdida total) | ≤ 4 horas | ≤ 1 hora |
| **Retención hot PITR** | 14 días | 30 días |
| **Retención cold semanal** | 12 semanas | 26 semanas |
| **Retención cold mensual** | 24 meses | 60 meses |
| **Retención fiscal (XML+CDR)** | **5 años** (regla SUNAT) | 5 años |

### 2. Estrategia 3-2-1 adaptada

- **3 copias**: la BD activa + PITR de Neon + dump externo a R2.
- **2 medios**: BD managed (Neon) + object storage (R2).
- **1 off-site**: R2 está en región distinta de Neon (Neon us-east, R2 auto-replicated).

### 3. Backups — capas

**Capa A — PITR continuo (Neon nativo)**

- Habilitar plan paid de Neon con **30 días** de PITR.
- Costo: ~$20/mes adicional al starter.
- Permite restaurar a cualquier segundo dentro de 30 días.
- **Esta es la primera línea de defensa**: para casi todos los incidentes (DROP TABLE accidental, deploy malo, corruption local) → recovery en minutos.

**Capa B — Dump nocturno a R2 (defense in depth)**

- Job a las 02:00 hora del tenant principal (Lima): `pg_dump --format=custom --compress=9 ... | restic backup` a bucket R2 dedicado.
- Cada dump cifrado **at rest** con clave aparte (no `CERT_MASTER_KEY` — separación de blast radius).
- `restic` da dedup, encryption, snapshots versionados.
- **Retención R2**:
  - Diarios: últimos 14.
  - Semanales: últimos 12.
  - Mensuales: últimos 24.
- Lifecycle policy R2 mueve mensuales >12 meses a "infrequent access tier" (más barato).

**Capa C — Backup fiscal separado (CDR+XML)**

- Object storage R2 bucket **distinto** `fiscal-archive-{env}/`, **inmutable** vía Object Lock (modo compliance, no governance).
- Cada `Receipt` archivado vía job de [[012]] sube su XML+CDR aquí adicionalmente al `Receipt.xml_archived_url`.
- **Nunca se borra hasta los 5 años**. Después un job especial purga.
- Bucket replicado a un segundo provider (B2) trimestralmente — protección contra "R2 borra mi cuenta por error".

**Capa D — Backup de secrets (cert master keys)**

- `CERT_MASTER_KEY` se respalda **manualmente** en gestor de passwords del owner (1Password / Bitwarden) en sobre cifrado adicional.
- Si Railway pierde la key → cualquier `.pfx` cifrado en BD queda inservible → tenants tendrían que re-subir certs. **Inaceptable**.
- Restore drill: una vez al año, demostrar que se puede recuperar `CERT_MASTER_KEY` del gestor y descifrar un cert sample.

### 4. Restore — runbook y drills

**Tipos de restore:**

| Escenario | Procedimiento | Quién | Tiempo objetivo |
|---|---|---|---|
| Tenant pidió "borraron una venta por error" | PITR Neon al timestamp anterior, restaura **fila específica** vía dump+filter | Backend Dev on-call | <1h |
| DROP TABLE accidental en prod | PITR Neon completo, swap branch | DBA | <2h |
| Corrupción de toda la DB | Restore desde R2 dump más reciente + replay PITR | DBA + Backend Dev | <4h |
| Pérdida total de Neon (provider down >24h) | Restore desde R2 dump a Postgres en otro provider (Supabase emergency) + cambiar `DATABASE_URL` | DBA + Architect | <4h |
| Pérdida de un `.pfx` tenant (descifrado falla) | Notificar tenant + bloquear emisión hasta re-upload | Tenant Success | depende del tenant |

**Drills trimestrales obligatorios** (calendarizados en GH issue recurrente):

1. Q1: restore tabla aislada desde PITR Neon → medir tiempo.
2. Q2: restore completo desde dump R2 a Neon staging branch → medir tiempo.
3. Q3: cifrado/descifrado round-trip con clave del gestor de passwords.
4. Q4: failover a provider alternativo (Supabase) usando dump R2 → medir tiempo.

Resultado de cada drill se logguea en `docs/runbooks/drills/YYYY-Q*.md`.

### 5. Object storage (R2) — backup propio

R2 ya replica automático dentro de Cloudflare. Para defense in depth contra "Cloudflare suspende mi cuenta":

- Job mensual sincroniza `fiscal-archive-{env}/` → `Backblaze B2 fiscal-mirror/`.
- Solo cold storage; nunca se lee desde B2 salvo emergencia.
- Costo: ~$0.005/GB/mes — negligible incluso a 100GB.

### 6. Datos del cliente borrados (GDPR-like)

LATAM no tiene un GDPR unificado pero PE tiene Ley 29733 (datos personales) y CO/MX tienen leyes similares. Política:

- Cliente puede solicitar borrado de sus datos personales (nombre, doc, dirección, teléfono).
- **Comprobantes fiscales NO se borran** (obligación legal). Se **anonimizan**: `customer_name = 'CLIENTE ANONIMIZADO'`, `customer_doc_number = NULL`. Datos contables intactos.
- Solicitud de borrado: ticket → procesado en <30 días → logueado en `audit_logs` + email confirmación.

### 7. Datos del tenant cancelado

Por [[015-tenant-onboarding]]:

- Tenant cancela → 90 días en `status='cancelled_grace'`. Acceso read-only, puede exportar.
- Día 90 → `status='terminated'`. Schema marcado, queries normales lo excluyen.
- Día 90+365 (1 año extra de seguridad) → purge físico: anonimización de PII, archive de comprobantes a R2 cold con `tenant_terminated` tag, drop de datos no-fiscales.
- Comprobantes fiscales del tenant terminado: se mantienen 5 años en R2 cold (la ley aplica al RUC, no a si el tenant siguió usando el software).

## Consequences

- ✅ RPO 5min para data crítica (PITR Neon) cubre casi todo.
- ✅ Backup 3-2-1 real → resistente a fallos de provider único.
- ✅ Retención fiscal blindada (immutable Object Lock + replica B2).
- ✅ Drills trimestrales evitan el "tenemos backups pero nunca los probamos".
- ⚠️ Costo adicional ~$30-40/mes (Neon paid PITR + R2 storage + B2 mirror). Justificado por compliance.
- ⚠️ Restore manual a provider alternativo es lento (4h). Para MVP aceptable; cuando RTO baje, considerar Supabase warm replica.
- 🔓 Riesgo abierto: ransomware en infraestructura propia del owner (laptop) podría comprometer `CERT_MASTER_KEY` si solo está en 1Password. Mitigación: 2FA + recovery key.
- 🔓 Riesgo abierto: bug en código de anonimización podría borrar datos fiscales. Mitigación: tests específicos + dry-run obligatorio antes de purge real.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Solo PITR Neon (sin dump externo) | Si Neon tiene un incidente de >RPO, perdemos data fiscal. Riesgo legal. |
| B. Backup horario en vez de nocturno | No agrega valor sobre PITR (que es continuo). Más costo de I/O. |
| C. Backup solo de comprobantes fiscales (no DB completa) | Pierdes el resto del estado. Si recuperas comprobantes pero no productos/clientes, el tenant no opera. |
| D. Replicación síncrona a otro provider | Latencia escritura sufre. Para MVP, dump nocturno + PITR ya da RPO < 24h y RTO ~4h. |
| E. Borrar comprobantes de tenants cancelados | Ilegal — el RUC del tenant sigue siendo auditable por SUNAT 5 años. |
| F. Sin drills (asumir que el backup funciona) | "Schrödinger's backup" — clásico. Drills baratos, vale la pena. |

## Implementation plan

1. Activar Neon paid plan + 30-day PITR (Roberto, SIS-XX).
2. Bucket R2 `db-backups-{env}/` + bucket `fiscal-archive-{env}/` con Object Lock (DBA + Architect).
3. Job nocturno `pg_dump + restic backup` corriendo en Railway cron (Backend Dev).
4. Job de archive de comprobantes a `fiscal-archive` (extensión del job de [[012]]) (Backend Dev).
5. Job trimestral sync R2 → B2 (Backend Dev).
6. Runbooks `docs/runbooks/{restore-row, restore-table, restore-full, failover-db}.md` (Architect + DBA).
7. Primer drill Q1 calendarizado (DBA).
8. Procedimiento PII deletion + anonymization helper (Backend Dev + Security).

## References

- [[001-multi-tenancy-strategy]] · [[012-sunat-production-hardening]] · [[013-deploy-environments-cicd]] · [[015-tenant-onboarding]]
- Neon PITR: https://neon.tech/docs/manage/branches#point-in-time-restore
- restic: https://restic.net/
- Cloudflare R2 Object Lock: https://developers.cloudflare.com/r2/buckets/object-lock/
- Ley 29733 Perú (protección datos personales): https://www.gob.pe/institucion/minjus/normas-legales/
