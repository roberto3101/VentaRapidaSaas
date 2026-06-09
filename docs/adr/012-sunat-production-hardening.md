# ADR-012: SUNAT producción — certificados, KMS, contingencia, secuencias y declaración

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-52

## Context

[[003-fiscal-emission-hexagonal]] cerró el aislamiento arquitectónico (port `IFiscalEmitter` + adapters por país) pero dejó pendiente lo que realmente se necesita para emitir en producción:

- **Certificados digitales** del tenant: están sin sitio, sin cifrado, sin rotación. ADR-003 dice "ADR de KMS pendiente" — es éste.
- **Firma XAdES**: librería, validación, manejo de errores de firma.
- **Secuencias correlativas gapless**: SUNAT exige series sin huecos. El módulo `comprobantes/` actual usa `_max + 1` dentro de transacción — funciona pero falla bajo carga sin lock dedicado.
- **Contingencia (SUNAT-OSE caído)**: queue de reintentos, emisión "PE-NA" (pendiente de aceptación), CDR tardío.
- **Resúmenes diarios de boletas**: SUNAT permite consolidar boletas <S/700 en resumen diario. No por unidad.
- **Anulación**: comunicación de baja (anulación) tiene su propio flujo.
- **Sandbox → producción**: checklist técnico para activar emisión real.
- **Auditoría**: XML firmado + CDR deben persistirse 5 años (regla SUNAT) — ¿en BD o en object storage?

Sin estas decisiones, `SunatFiscalEmitterAdapter` queda como stub. Y `comprobantes/comprobantes.service.ts` emite "boletas internas" no fiscales — sirve para MVP-demo, NO para vender.

## Decision

### 1. Almacenamiento del certificado — cifrado con KMS, jamás en BD plana

- Cada tenant sube su `.pfx` (PKCS12) o equivalente vía endpoint protegido (`POST /api/v1/tenants/me/certificate`, solo `tenant_admin`).
- El binario del `.pfx` se cifra con AES-256-GCM. La **clave de cifrado** vive en **KMS gestionado**: AWS KMS / GCP KMS / Hashicorp Vault. **NUNCA** en variables de entorno ni en BD plana.
- En BD se guarda:

```
tenant_certificates:
  id, tenant_id, country_code
  encrypted_blob (bytea)         -- pfx cifrado
  encryption_key_id (text)       -- ARN/path del KMS key usada (auditoría + rotación)
  nonce (bytea)                  -- AES-GCM nonce
  cert_serial (text)             -- número de serie del cert (para identificarlo sin descifrar)
  cert_subject (text)            -- CN/RUC del titular
  valid_from, valid_until (timestamptz)
  uploaded_by, uploaded_at
  rotated_from (FK self, nullable) -- linaje de rotación
  status: 'active' | 'rotated' | 'revoked' | 'expired'
```

- La **passphrase del .pfx** también se cifra (campo `encrypted_passphrase`) con la misma key KMS, distinto nonce.
- Descifrado: solo el `SunatFiscalEmitterAdapter` (corriendo en el worker o request handler) llama KMS para descifrar **en memoria** justo antes de firmar. Nunca persiste descifrado.
- **Caché en memoria del adapter**: cert descifrado vive máximo 5 minutos en proceso → reduce llamadas a KMS sin abrir ventana grande.

**MVP fallback (cuando no hay KMS gestionado disponible)**: clave maestra en variable de entorno `CERT_MASTER_KEY` (32 bytes hex) en el secret store del hosting (Railway/Render). Esto NO es KMS real, pero evita el peor caso (cert en plano en BD). Marcado en docs como `TODO: migrate to KMS before $10k MRR`.

### 2. Firma XAdES-BES + generación UBL — delegada al microservicio PHP Greenter

[[003-fiscal-emission-hexagonal]] decidió delegar generación XML + firma + envío SUNAT a un **microservicio PHP con Greenter** ([GitHub thegreenter/greenter](https://github.com/thegreenter/greenter)). Razón: Greenter ya implementa correctamente canonicalización C14N, namespaces UBL 2.1, firma XAdES-BES con SHA-256/RSA, y los catálogos SUNAT actualizados. Tiene años de uso productivo en Perú. Reimplementar en Node nos cuesta semanas y arrastraría bugs sutiles que SUNAT rechazaría.

**Arquitectura del microservicio:**

- **Stack**: PHP 8.2+ con extensiones obligatorias (`soap`, `zlib`, `openssl`, `curl` per [Greenter docs](https://fe-primer.greenter.dev/docs/webservices/)) corriendo en contenedor Docker dedicado. Punto de partida sugerido: **Lycet** ([GitHub giansalex/lycet](https://github.com/giansalex/lycet)) — REST API ya implementada sobre Greenter + Symfony con Docker config. Adaptamos endpoints + auth a nuestras necesidades.
- **Endpoints REST internos** (no expuestos públicamente, solo accesibles desde el VPC/private network del backend NestJS):
  - `POST /fiscal/v1/invoice` — emite factura
  - `POST /fiscal/v1/boleta` — emite boleta
  - `POST /fiscal/v1/credit-note` — emite nota crédito
  - `POST /fiscal/v1/debit-note` — emite nota débito
  - `POST /fiscal/v1/void` — comunicación de baja
  - `POST /fiscal/v1/summary` — resumen diario boletas (fase 2)
  - `GET  /fiscal/v1/status/:hash` — consulta CDR

- **Input JSON**: el adapter NestJS arma un DTO conforme al esquema de Greenter (Sale, SaleDetail, Client, Company), envía + el cert encriptado + passphrase encriptada.
- **Output JSON**: `{ status, hashCode, signedXml (base64), cdr (base64), errorCode?, errorMessage? }`.
- **Auth interna**: shared secret HMAC entre backend NestJS y microservicio PHP (variable `FISCAL_SHARED_SECRET`). El backend firma cada request, el microservicio verifica.
- **Sin estado**: el microservicio NO persiste cert ni resultado. Stateless puro. La persistencia (Receipt, signedXml, cdr) vive en Postgres del backend NestJS.
- **Tests**: golden files de XML generado por Greenter para los 5 tipos de comprobante × 3 escenarios cada uno (sin nonces, fechas fijas para reproducibilidad).

**Por qué microservicio separado y no PHP-FPM montado en el backend:**
- Aislamiento de runtime: un crash de Greenter no tumba el backend NestJS.
- Deploy independiente: actualizar Greenter no requiere redeploy del backend.
- Escala independiente: bajo carga de cierre de mes podemos escalar solo el microservicio fiscal.
- Lenguaje aislado: el equipo Node no necesita aprender PHP para mantener el resto.

### 3. Secuencias correlativas — gapless por (tenant, location, type, series)

[[005-sale-concurrency]] establece transacciones Serializable. Para receipt numbering:

- Tabla dedicada de secuencias (evita race en `_max(number)`):

```
receipt_sequences:
  id, tenant_id, location_id, type, series
  last_number (bigint)
  updated_at
  @@unique([tenant_id, location_id, type, series])
```

- En la transacción de emisión:
  ```sql
  UPDATE receipt_sequences
  SET last_number = last_number + 1, updated_at = now()
  WHERE tenant_id = $1 AND location_id = $2 AND type = $3 AND series = $4
  RETURNING last_number
  ```
  Si no existe la fila → `INSERT ... ON CONFLICT DO UPDATE` (upsert) con `last_number = 1`.

- El `UPDATE` hace lock de fila → serializa concurrentes a la misma serie. La transacción ya es Serializable, no agregamos `FOR UPDATE` redundante.

- **Gapless garantizado**: si la transacción aborta después de obtener `last_number` (ej. firma falla), el número se "pierde". SUNAT permite huecos justificados → el `Receipt` se persiste igual con `status = 'failed_signing'` y `number` consumido, manteniendo trazabilidad. **Nunca se reusa un número**.

- **Series por tipo y sede**: política por defecto `T001/B001/F001/NC01/ND01` por sede (per `comprobantes.service.ts` actual). Tenant puede customizar.

### 4. Contingencia SUNAT — outbox + reintentos + estados

`Receipt.status` workflow:

```
draft → signed → sent → accepted
                     ↘ rejected (error fatal — requiere intervención)
                     ↘ pending (SUNAT timeout/down — reintentar)
                     ↘ failed_signing (firma falló — Receipt persiste para auditoría, no se reusa el número)
```

- **Emisión NO bloquea la venta** (ya decidido [[005-sale-concurrency]] §Capa 2).
- Outbox publica `ReceiptToEmitEvent` → handler en `receipts/` corre `SunatFiscalEmitterAdapter.emit()`.
- Si SUNAT responde 200 + CDR aceptado → `status = 'accepted'`, persiste CDR.
- Si SUNAT responde error fatal (RUC dado de baja, certificado revocado) → `status = 'rejected'`, notifica al `tenant_admin`. NO reintenta. Reparación manual.
- Si SUNAT responde timeout / 5xx / red caída → `status = 'pending'`, reencola con backoff exponencial: 1m, 5m, 15m, 1h, 4h, 24h. Max 6 intentos. Tras agotar → `status = 'pending_manual'`, notificación urgente.
- **Job de reintento**: cron cada 5 min escanea `pending` con `next_retry_at <= now()`.

### 5. Resúmenes diarios de boletas (RC — Resumen de Comprobantes)

SUNAT permite agrupar boletas (a personas, <S/700) en un único resumen diario.

- **MVP**: NO usamos resumen — cada boleta se emite individualmente (es más caro en llamadas pero más simple y permite anulación granular).
- **Fase 2** (cuando volumen lo justifique, ej. >500 boletas/día/tenant): job nocturno 23:55 hora tenant arma RC del día y lo envía. Cada `Receipt.summaryId` referencia el RC en el que viajó.

### 6. Anulación / Comunicación de Baja

- Boleta o factura anulada → genera **Comunicación de Baja** (no nota de crédito) si ≤7 días.
- Modelado como `Receipt.status = 'voided'` + endpoint `POST /api/v1/receipts/:id/void` (per ADR-003 + ADR-009 patterns).
- El job de anulación genera XML CDR específico para SUNAT y lo envía.
- Si >7 días → la "anulación" se modela como nota de crédito (ver [[011-returns-and-credit-notes]]).

### 7. Sandbox → producción — checklist técnico

`Tenant.fiscalMode` ∈ {`'dryrun'`, `'sandbox'`, `'production'`} (ADR-003 §reglas inviolables).

Migración a `production` requiere checklist programático:

```
□ Certificado .pfx subido y validable (puede firmar)
□ Certificado vigente >30 días (no a punto de expirar)
□ RUC del tenant verificado activo (consulta SUNAT padrón)
□ Test E2E contra sandbox: emite boleta dummy, recibe CDR aceptado
□ Series configuradas en SUNAT (cada tenant declara en su clave SOL las series que usará)
□ Contador del tenant aprueba (firma digital o checkbox documentado)
```

UI en `settings/fiscal` muestra los items con estado. Botón "Activar emisión real" disponible solo cuando todos pasan + confirmación doble.

### 8. Persistencia de XML + CDR — BD + cold storage

- `Receipt.signed_xml` (text, ~3-10KB típico): se mantiene en BD por **6 meses**.
- `Receipt.cdr` (text, ~1-3KB): mismo.
- A los 6 meses → job mensual archiva ambos a object storage (S3 / R2 / B2). En BD queda `Receipt.xml_archived_url` (string), columnas `signed_xml` y `cdr` se vacían.
- Retención total: **5 años** (regla SUNAT). Después se puede purgar.
- Recuperación bajo demanda: endpoint `GET /api/v1/receipts/:id/xml` consulta BD primero, cold storage si está vacío.

## Consequences

- ✅ Certificados nunca en plano. Auditoría completa de quién subió/rotó.
- ✅ Secuencias gapless reales bajo concurrencia.
- ✅ Contingencia maneja caídas SUNAT sin perder ventas.
- ✅ Path claro sandbox → producción evita disparar mal por accidente.
- ✅ Almacenamiento escalable (cold storage post 6 meses) evita explosión de BD.
- ⚠️ Sin KMS gestionado el MVP usa env var como "poor man's KMS" — aceptable hasta ~$10k MRR, después migrar.
- ⚠️ Microservicio PHP agrega un servicio más al stack (~+150MB imagen Docker, ~+30MB RAM idle). Costo de deploy aceptable a cambio de no reimplementar XAdES + UBL en Node.
- ⚠️ El cert `.pfx` viaja por la red interna del backend al microservicio en cada emisión. Mitigación: red privada (Railway service-to-service o VPC), shared secret HMAC, jamás expuesto a internet.
- 🔓 Riesgo abierto: SUNAT cambia regla de firma o canonicalización (histórico de breaking changes regulatorios). Mitigación: Greenter suele tener parches en días/semanas; suscribirse a releases del repo + tests E2E contra sandbox SUNAT en CI nightly.
- 🔓 Riesgo abierto: pérdida del `.pfx` del cliente. Mitigación: tenant debe declarar checksum SHA-256 al subir; si lo regenera con SUNAT, debe re-subir y se versiona.
- 🔓 Riesgo abierto: Greenter es comunitario, sin SLA. Si queda abandonado podríamos hacer fork. Probabilidad baja (uso productivo masivo en Perú).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Firma en servidor del cliente (cert nunca sale del cliente) | Requiere instalar agente local. Incompatible con SaaS. |
| B. Delegar firma a OSE externo de pago (NubeFact, APIsPERU, APISUNAT) | Costo recurrente sin presupuesto. Greenter es free + auto-hosted ([[003]] alternativa B). |
| B.bis. Implementar XAdES nativo en Node con `xadesjs` | Semanas de trabajo + bugs sutiles de canonicalización. Greenter ya lo resolvió y tiene años productivo. |
| C. Certificado compartido entre tenants | Ilegal — cada RUC necesita su propio cert. |
| D. Reintentos en hot loop (sin backoff) | Mata SUNAT con tráfico al caer un endpoint. |
| E. Resumen diario desde MVP | Bloquea anulación individual sin más lógica. Diferido a fase 2. |
| F. Almacenar XML/CDR solo en BD para siempre | A 1M comprobantes/año = ~10GB/año/tenant. No escala. |

## Implementation plan

1. Tabla `tenant_certificates` + endpoint subida + cifrado AES-GCM con clave del env var MVP (Backend Dev + Security, SIS-XX).
2. Tabla `receipt_sequences` + migración de datos actuales (DBA, SIS-XX).
3. Microservicio `fiscal-php/` con Greenter (clonar Lycet como base + adaptar endpoints + auth HMAC + Dockerfile) (Architect + Backend Dev PHP, SIS-XX).
4. `SunatFiscalEmitterAdapter` en NestJS que llama vía HTTP al microservicio + golden tests (Backend Dev, SIS-XX).
4. Outbox + worker de reintentos (Backend Dev, depende de [[005]] outbox base).
5. UI subida cert + checklist sandbox→prod (Frontend Dev, SIS-XX).
6. Job cold-storage archive a los 6 meses (Backend Dev, fase 2).
7. Tests E2E sandbox SUNAT en CI nightly (QA).

## References

- [[001-multi-tenancy-strategy]] · [[002-multi-country-strategy]] · [[003-fiscal-emission-hexagonal]] · [[005-sale-concurrency]] · [[009-cash-shifts]] · [[011-returns-and-credit-notes]]
- SUNAT CPE: https://cpe.sunat.gob.pe/
- Greenter (librería PHP): https://github.com/thegreenter/greenter
- Greenter webservices docs: https://fe-primer.greenter.dev/docs/webservices/
- Lycet (REST API Docker sobre Greenter): https://github.com/giansalex/lycet
- UBL 2.1: http://docs.oasis-open.org/ubl/UBL-2.1.html
- AWS KMS envelope encryption: https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping
- SUNAT — Reglas Validación CPE actualizadas abril 2025: https://gosocket.net/centro-de-recursos/la-sunat-de-peru-actualiza-las-reglas-de-validacion-de-los-cpe-y-de-las-gre-abril-2025/
