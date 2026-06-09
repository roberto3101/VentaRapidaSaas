# ADR-015: Onboarding de tenants — signup, trial, provisioning, suspension

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-55

## Context

[[001-multi-tenancy-strategy]] decide cómo se aíslan los tenants pero NO cómo nacen, viven y mueren. Faltan decisiones operativas:

- **Signup**: ¿self-serve con tarjeta? ¿free trial? ¿waitlist y sales touch?
- **Provisioning**: ¿qué recibe un tenant nuevo al crear cuenta? ¿catálogo demo? ¿sucursal default? ¿usuario admin con qué clave?
- **Identificación**: ¿slug en URL (`acme.svr.app`)? ¿código manual? ¿UUID?
- **Multi-país**: ¿cómo elige país? ¿qué cambia por elección?
- **Plan/billing**: ¿free tier? ¿planes? ¿cobranza manual o auto?
- **Trial expiry**: ¿qué pasa al día 15 sin pagar? ¿read-only? ¿lock total? ¿gracia?
- **Suspension**: ¿pago vencido lock-out duro o blando?
- **Cancellation**: ¿qué pasa con la data?
- **Activación fiscal**: certificado SUNAT/SENIAT no es del día 1 — el tenant lo sube cuando esté listo.

Sin esto, cada tenant nuevo requiere intervención manual del owner. No escala.

## Decision

### 1. Signup self-serve + trial 14 días sin tarjeta

Flujo `POST /api/v1/auth/signup`:

```json
{
  "tenantName": "Bodega Don José",
  "countryCode": "PE",
  "adminEmail": "jose@bodega.com",
  "adminPassword": "********",
  "adminName": "José Pérez",
  "businessType": "bodega"        // bodega | minimarket | mayorista — segmentación
}
```

Backend valida:

- `countryCode` ∈ países activos (PE, VE).
- `adminEmail` no existe en `users` con `tenantId = NULL` (super_admin).
- `tenantName` no requiere unicidad — dos tenants pueden llamarse igual.
- `adminPassword` ≥ 12 chars + complejidad (sin reglas absurdas — NIST 800-63B).
- Captcha (Cloudflare Turnstile) si el IP ya hizo >2 signups en 24h.

Crea atomic en transacción:

1. `Tenant { id, name, countryCode, slug (auto-generado), status='trial', trialEndsAt: now + 14d, fiscalMode='sandbox', defaultLocale=es-{countryCode} }`.
2. `Location { tenantId, name='Principal', isMain=true, address=null }`.
3. `User { tenantId, email, name, role='tenant_admin', branchIds=[location.id], emailVerified=false }`.
4. `Seed catalog` por `businessType` (ver §3).
5. Envía email de verificación con magic link (TTL 24h).

Respuesta: `{ tenantSlug, accessToken, refreshToken }` (login automático para flujo limpio).

### 2. Identificación — slug auto + dominio futuro

- **Slug**: snake-case del `tenantName`, dedupe sufijo numérico si colisiona (`bodega-don-jose-2`).
- Usado en URL de API si modo subdomain: `<slug>.api.sistemaventarapida.com` (fase 2).
- MVP: slug solo identifica en login (`POST /auth/login` requiere `email + tenantSlug` per [[006-auth-and-rbac]]).
- Tenant puede pedir slug custom una vez (`patch /tenants/me/slug`), si está disponible. Después, locked.
- **Dominio propio** (`pos.bodega.com`) en fase 3 — fuera de scope MVP.

### 3. Provisioning — seed por business type

Cada `businessType` recibe un seed mínimo para no enfrentarse a pantalla vacía:

| Seed | Bodega | Minimarket | Mayorista |
|---|---|---|---|
| Categorías | "Bebidas, Snacks, Aseo, Lácteos, Panadería, Otros" (6) | + "Limpieza, Cuidado personal, Frescos" (9 total) | + "Granos al por mayor, Bebidas caja" (11) |
| Sucursales | 1 (Principal) | 1 (Principal) | 1 (Principal) |
| Roles preconfigurados | `tenant_admin` + plantilla `cashier` | + plantilla `branch_manager` | + plantilla `accountant` |
| Lista de precios | "General" | "General" + "Mayoreo" | "General" + "Mayoreo" + "Distribuidor" |
| Series comprobantes | T001, B001, F001, NC01 | mismo | mismo |
| Settings default | `allowNegativeStock=false`, `returnWindowDays=15` | `returnWindowDays=30` | `returnWindowDays=30`, `creditLineEnabled=true` |

Sin productos ni clientes seed — eso es del tenant. Wizard post-signup §4 ayuda a empezar.

### 4. Wizard post-signup (5 pasos opcionales, skippable)

UI primera vez al loguear como `tenant_admin`:

1. **Verifica tu email** (si no se hizo).
2. **Datos del negocio**: RUC/RIF, dirección sucursal Principal, teléfono. Persistido en `tenant.fiscalData`.
3. **Crea tu primer producto** (form simplificado: nombre + precio + stock inicial).
4. **Importa catálogo** (opcional): subida CSV con template descargable.
5. **Invita a tu equipo**: agregar emails con rol (`cashier`, `branch_manager`).

Cada paso `skip`-eable. El wizard no bloquea acceso al POS. Estado del wizard en `tenant.onboardingProgress` (jsonb).

### 5. Trial → plan paid — flujo

`Tenant.status` workflow:

```
trial → active            (suscribió a plan)
trial → trial_expired     (día 15 sin suscribir → read-only)
active → past_due         (cobro falló, 3 días gracia)
past_due → suspended      (gracia agotada → read-only)
suspended → active        (pago llegó)
suspended → cancelled_grace (90 días desde suspensión sin pago → notif cancelación)
cancelled_grace → terminated  (día 90 → cleanup per [[014]])
* → cancelled_by_user     (user click cancelar; va a cancelled_grace)
```

**Acciones según status** (enforcement en `TenantStatusGuard`):

| Status | Login | POS | Reportes | Settings | Export data | Emisión SUNAT |
|---|---|---|---|---|---|---|
| `trial` | ✅ | ✅ (sandbox) | ✅ | ✅ | ✅ | sandbox only |
| `active` | ✅ | ✅ | ✅ | ✅ | ✅ | production OK |
| `trial_expired` | ✅ | ❌ | ✅ (read) | ✅ (billing only) | ✅ | ❌ |
| `past_due` | ✅ | ✅ banner urgente | ✅ | ✅ | ✅ | ✅ |
| `suspended` | ✅ | ❌ | ✅ (read) | ✅ (billing only) | ✅ | ❌ |
| `cancelled_grace` | ✅ | ❌ | ✅ (read) | ❌ | ✅ | ❌ |
| `terminated` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 6. Planes — modelado MVP, billing manual al inicio

**Modelo** (entra al schema desde MVP, aunque billing sea manual):

```
plans:
  id (uuid), code (text, único, ej. 'starter', 'pro', 'enterprise')
  name, description
  monthly_price_usd (Decimal)
  features (jsonb)         -- {maxBranches: 1, maxUsers: 3, maxProductsPerCatalog: 500, sunatEmissionEnabled: true, supportLevel: 'email'}

tenant_subscriptions:
  id, tenant_id (unique — un tenant un plan activo)
  plan_id (FK)
  started_at, current_period_start, current_period_end
  status: 'trial' | 'active' | 'past_due' | 'cancelled'
  payment_provider: 'manual' | 'stripe' | 'mercadopago'
  external_subscription_id (text, nullable)
  cancellation_reason
```

**Planes iniciales**:

| Plan | $/mes | Sucursales | Usuarios | SUNAT real | Soporte |
|---|---|---|---|---|---|
| `starter` | $19 | 1 | 3 | ✅ | email |
| `pro` | $59 | 5 | 15 | ✅ | email + chat |
| `enterprise` | a cotizar | ilimitado | ilimitado | ✅ | dedicated |

**MVP billing**: manual via Wise / transferencia. Owner marca `tenant_subscriptions.status='active'` cuando recibe pago. Fase 2: integración Stripe / MercadoPago Connect.

**Enforcement de features**: guard `@RequireFeature('sunatEmissionEnabled')` lee del plan del tenant. Si plan no incluye → 403 con mensaje "Esta función requiere plan Pro o superior".

### 7. Activación fiscal real (sandbox → production)

Por [[012-sunat-production-hardening]] §7 — checklist técnico. Flujo UI:

1. Tenant entra a `settings/fiscal` → ve checklist con estados.
2. Sube `.pfx` + passphrase → backend valida (`opens correctly`, `not expired`).
3. Backend consulta padrón SUNAT con el RUC → verifica activo.
4. Tenant ejecuta "Emitir comprobante de prueba" → SUNAT sandbox → CDR OK.
5. Checkbox "Mi contador validó que estoy listo".
6. Click "Activar emisión real" → confirmación doble → `fiscalMode='production'`.

Reversible: tenant_admin puede volver a `sandbox` desde el mismo panel (raro pero útil para troubleshoot).

### 8. Cancelación por el usuario

- `DELETE /api/v1/tenants/me` (solo `tenant_admin`, requiere password re-confirm).
- Cambia `status='cancelled_by_user'` → entra a flujo `cancelled_grace` (90 días).
- Email confirmación + recordatorios día 60, 80, 89.
- Durante grace puede reactivar (`POST /tenants/me/reactivate`) sin perder data.
- Día 90 → `terminated` → cleanup per [[014]].

### 9. Super admin "impersonation" para soporte

Owner / soporte necesita poder entrar a un tenant para diagnosticar problemas:

- Endpoint `POST /api/v1/admin/tenants/:id/impersonate` (solo `super_admin`).
- Genera JWT con `actAsTenantId=:id` y `impersonatedBy=<superAdminUserId>`.
- TODA acción durante impersonation se logguea en `audit_logs` con `impersonatedBy` set.
- Banner rojo en UI "Estás operando como Bodega Don José — todas tus acciones se auditan".
- Sesión impersonation TTL 1h (no usa refresh token).

## Consequences

- ✅ Self-serve real desde día 1 → owner no es bottleneck.
- ✅ Trial 14d sin tarjeta baja fricción adopción.
- ✅ Provisioning con seed evita "pantalla vacía blues".
- ✅ Workflow de status cubre todos los casos reales (gracia, suspensión, cancelación).
- ✅ Plan model permite enforcement progresivo sin reescribir.
- ⚠️ Billing manual no escala >50 tenants pagados. Migrar a Stripe/MP en fase 2.
- ⚠️ Impersonation es poder grande — audit log es la única salvaguarda. Confiar pero verificar.
- 🔓 Riesgo abierto: fraude por signups múltiples del mismo actor para abusar trial. Mitigación: captcha + heurística (IP + email pattern + business_type plausible).
- 🔓 Riesgo abierto: tenant en `trial_expired` sigue ocupando recursos. Mitigación: job mensual purga workspaces inactivos >180d sin login.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Free tier permanente | Costo de soporte > revenue. Trial 14d es estándar industria. |
| B. Waitlist + sales touch desde MVP | No escala. Self-serve gana en LATAM para tickets pequeños (<$100). |
| C. Sin trial (cobrar día 1) | Fricción alta para bodega que apenas probó la app. Trial es industry standard. |
| D. Auto-provisión de catálogo "completo" para bodega (200 productos sample) | Genera UI ruidosa, tenant los va a borrar todos. Mejor seed mínimo. |
| E. Slug = UUID | URLs feas, mala memorabilidad. snake-case del nombre con dedupe es mejor. |
| F. Cancelación inmediata sin grace 90d | Cliente que canceló por error pierde todo. Grace es buen will. |
| G. Hacer multi-país opcional al signup (default PE) | Confusión post-signup ("¿por qué dice IGV si soy VE?"). Forzar elección upfront. |

## Implementation plan

1. Schema `plans`, `tenant_subscriptions` + seed de planes iniciales (DBA, SIS-XX).
2. Endpoint `POST /auth/signup` con transacción atómica + seed catalog (Backend Dev).
3. Wizard UI 5 pasos (Frontend Dev).
4. `TenantStatusGuard` con tabla de permisos por status (Backend Dev).
5. Cron `expire-trials`, `process-grace-expirations` (Backend Dev).
6. Impersonation endpoint + banner UI (Backend Dev + Frontend Dev + Security).
7. Email templates (signup welcome, trial-ending, payment-failed, cancellation-reminder) en Resend (Backend Dev).
8. Tests: signup happy path, trial expiry, suspension flow, impersonation audit, cancellation grace (QA).

## References

- [[001-multi-tenancy-strategy]] · [[002-multi-country-strategy]] · [[006-auth-and-rbac]] · [[012-sunat-production-hardening]] · [[013-deploy-environments-cicd]] · [[014-backup-restore-dr]]
- NIST 800-63B (password guidelines): https://pages.nist.gov/800-63-3/sp800-63b.html
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
