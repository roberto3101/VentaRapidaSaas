# ADR-021: Webhooks de pasarelas — seguridad, idempotencia, retry

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-61

## Context

Pasarelas de pago ([[018-payments-unified]]) confirman cobros **asincrónicamente**:

- Yape (Culqi / MercadoPago): después del OTP del cliente, llega webhook con el resultado.
- Tarjeta (Niubiz / Izipay): después de 3DS, llega webhook.
- Transferencia (en futuro con open banking): llega webhook cuando se acredita.

Esto es la única forma de saber si un pago se completó realmente. **Sin webhooks confiables, la venta queda en `pending` para siempre** o el cajero tiene que llamar manual al adquirente.

Atacante con conocimiento del endpoint puede:

- Enviar webhook falso "el pago de S/5000 fue exitoso" → el sistema marca la venta como cobrada → el cliente sale sin pagar.
- Replay un webhook viejo válido para duplicar la captura.
- Saturar el endpoint con miles de requests.

Industria estandariza la defensa: HMAC-SHA256 + timestamp + idempotency. Documentado por Stripe, GitHub, Shopify, dev community ([dev.to — Webhook Security Best Practices 2025-2026](https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n)).

## Decision

### 1. Endpoint único `/api/v1/webhooks/:provider` con verificación HMAC

```
POST /api/v1/webhooks/culqi
POST /api/v1/webhooks/mercadopago
POST /api/v1/webhooks/niubiz
POST /api/v1/webhooks/izipay
```

Cada provider tiene su shared secret almacenado en `tenant_payment_methods.credentials_encrypted.webhookSecret` ([[018]] §8). El secret se genera o se obtiene del dashboard del provider y el tenant lo configura en setup.

### 2. Verificación HMAC-SHA256 con raw body

```ts
@Controller('webhooks')
export class WebhooksController {
  // CRÍTICO: usar raw body, NO el JSON parseado
  @Post(':provider')
  @UseGuards(WebhookSignatureGuard)  // valida HMAC antes de procesar
  async receive(
    @Param('provider') provider: string,
    @RawBody() rawBody: Buffer,
    @Headers() headers: Record<string, string>,
  ) {
    // Si llegó aquí, HMAC verificado.
    return this.dispatcher.dispatch(provider, rawBody, headers);
  }
}
```

`WebhookSignatureGuard`:

```ts
async canActivate(ctx: ExecutionContext) {
  const req = ctx.switchToHttp().getRequest();
  const provider = req.params.provider;
  const rawBody = req.rawBody as Buffer;  // populated por middleware específico
  const signature = req.headers[PROVIDER_SIG_HEADER[provider]];
  const timestamp = req.headers[PROVIDER_TS_HEADER[provider]];

  // 1. Validar timestamp (anti-replay)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {  // 5 min window
    throw new UnauthorizedException('Webhook timestamp out of window');
  }

  // 2. Resolver secret del tenant (del payload o del header `X-Tenant-Id` del provider si soporta)
  const secret = await this.resolveSecret(provider, rawBody);

  // 3. Computar HMAC del payload
  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // 4. Constant-time compare
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new UnauthorizedException('Webhook signature mismatch');
  }
  return true;
}
```

**Razones precisas** (todas validadas por [Apidog — Webhook Signature Verification](https://apidog.com/blog/webhook-signature-verification/), [Hooklistener — Webhook Security HMAC](https://www.hooklistener.com/learn/webhook-security-fundamentals), [Hookdeck — SHA256 Webhook Signature Verification](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification)):

- **Raw body, no parseado**: si parseas JSON y re-serializas, bytes cambian y HMAC falla. NestJS necesita `app.use(express.json({ verify: (req, _, buf) => { req.rawBody = buf; } }))` o equivalente Fastify.
- **Timestamp ±5 min**: previene replay de webhooks capturados.
- **Constant-time compare** (`timingSafeEqual`): previene timing attacks.
- **HMAC-SHA256** estándar industria (Stripe, GitHub, Shopify usan el mismo).

### 3. Idempotencia — tabla `webhook_events` con UNIQUE

```
webhook_events:
  id (uuid)
  provider (text)              -- 'culqi' | 'mercadopago' | ...
  event_id (text)              -- ID único del evento según el provider (Culqi: 'evt_xxx', MP: 'id')
  event_type (text)            -- 'charge.creation.succeeded', 'payment.updated', etc.
  raw_payload (jsonb)
  signature_verified_at (timestamptz)
  received_at (timestamptz)
  processed_at (timestamptz nullable)
  processing_status: 'pending' | 'processed' | 'failed' | 'ignored'
  processing_attempts (int default 0)
  processing_error (text nullable)
  related_payment_id (uuid nullable, FK)   -- ligado al Payment una vez resuelto

  @@unique([provider, event_id])           -- KEY de idempotencia
  @@index([processing_status, received_at])
```

Flujo:

```ts
async dispatch(provider, rawBody, headers) {
  const eventId = this.extractEventId(provider, rawBody);

  // Idempotencia: UPSERT con conflict do nothing
  const inserted = await this.db.webhookEvent.create({
    data: {
      provider, eventId, rawPayload: JSON.parse(rawBody),
      receivedAt: new Date(), signatureVerifiedAt: new Date(),
      processingStatus: 'pending',
    },
  }).catch(err => {
    if (err.code === 'P2002') return null;  // ya existe — duplicado del provider
    throw err;
  });

  if (!inserted) {
    this.logger.info(`Webhook duplicate ignored: ${provider}/${eventId}`);
    return { status: 'duplicate' };
  }

  // Procesar en transacción
  await this.processEvent(inserted.id);
  return { status: 'accepted' };
}
```

Esto garantiza:
- Provider reenvía mismo evento (común en Stripe, Culqi, MP) → procesamos solo una vez.
- Si crasheamos a medio procesar → siguiente intento ve `processingStatus='pending'` y reanuda.
- Si procesamos OK → `processed`, futuros duplicados se ignoran.

### 4. Procesamiento — en transacción, idempotente

```ts
async processEvent(webhookEventId: string) {
  return this.db.$transaction(async tx => {
    const evt = await tx.webhookEvent.findUnique({ where: { id: webhookEventId } });
    if (evt.processingStatus === 'processed') return;  // double-check

    try {
      // Resolver Payment afectado (cada provider tiene su mapping)
      const payment = await this.resolvePayment(tx, evt);
      if (!payment) {
        // Webhook de venta que no es nuestra (raro) o pre-creación
        await tx.webhookEvent.update({
          where: { id: evt.id },
          data: { processingStatus: 'ignored', processedAt: new Date() },
        });
        return;
      }

      // Llamar a la strategy para confirmar / actualizar estado
      const strategy = this.registry.for(payment.tenantId, payment.methodCode);
      const result = await strategy.confirm(payment, evt.rawPayload);

      // Actualizar Payment
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          capturedAt: result.capturedAt ?? null,
          providerPayload: evt.rawPayload,
        },
      });

      // Si Sale tiene TODOS los Payment 'captured' → emit SaleFullyPaidEvent
      const sale = await this.checkSaleFullyPaid(tx, payment.saleId);
      if (sale.allCaptured) {
        await tx.outboxEvent.create({ data: { type: 'SaleFullyPaid', payload: { saleId: sale.id } } });
      }

      // Marcar webhook como procesado
      await tx.webhookEvent.update({
        where: { id: evt.id },
        data: { processingStatus: 'processed', processedAt: new Date(), relatedPaymentId: payment.id },
      });
    } catch (err) {
      await tx.webhookEvent.update({
        where: { id: evt.id },
        data: {
          processingStatus: 'failed',
          processingAttempts: { increment: 1 },
          processingError: err.message.slice(0, 1000),
        },
      });
      throw err;  // 500 al provider — reenviará
    }
  }, { isolationLevel: 'Serializable', timeout: 10_000 });
}
```

**Transaccionalidad clave**:
- Toda la actualización (Payment + Sale check + WebhookEvent update + OutboxEvent) en una sola transacción Serializable.
- Si CUALQUIER paso falla → rollback total, webhook queda `pending` para retry del provider.
- El provider verá 500/timeout y reenviará. Idempotencia garantiza no duplicar.

### 5. Rate limit y abuse prevention

- `@nestjs/throttler` (ya instalado per `backend/package.json`) en `/webhooks/*` con límite **100 req/min por IP** ([dev.to — Webhook Security Best Practices](https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n)).
- IP allowlist opcional por provider (Culqi, MP publican CIDR ranges). Bloquea ataques desde IPs no-provider. Refresh nocturno via cron.
- Si pasa de rate limit → 429. Provider reintenta con backoff.
- Logs con `level=warn` para cada `UnauthorizedException` del guard → alerta de [[016-observability]] si >50 fallos en 1h (posible ataque).

### 6. Async dispatch — webhook responde rápido

Provider espera respuesta en <10s típicamente. Si el procesamiento toma más → timeout y reintento. Estrategia:

```ts
// Endpoint:
async receive(...) {
  await this.persistAsPending(provider, rawBody);  // <50ms
  process.nextTick(() => this.processEvent(eventId).catch(this.handleAsyncError));
  return { status: 'accepted' };  // 200 inmediato
}
```

- Persistir el evento en `webhook_events` (rápido).
- Encolar el procesamiento real async (`process.nextTick` o BullMQ futuro).
- Responder 200 al provider inmediato.
- Si el async falla → registrado como `failed`, job de retry lo reintenta cada 5min hasta max 6 intentos (igual patrón que [[012]] §4).

### 7. Webhook secret rotation

Multi-secret válido: el tenant puede rotar el webhook secret sin downtime:

```
tenant_payment_methods.credentials_encrypted = {
  webhookSecret: '...current...',
  webhookSecretPrevious: '...old, valid until rotatedAt+72h...'
}
```

Guard valida contra ambos. Tras 72h, el viejo se purga. Provider va recibiendo eventos firmados con el current (después del switch del lado provider).

### 8. Observabilidad

Métricas obligatorias ([[016-observability-and-audit]] §3):

- `webhook_received_total{provider}` — counter
- `webhook_verified_total{provider, result}` — counter (`result` = 'ok' | 'signature_fail' | 'timestamp_fail')
- `webhook_processing_duration_seconds{provider}` — histogram
- `webhook_processing_failed_total{provider, reason}` — counter
- `webhook_pending_backlog{provider}` — gauge (eventos en `pending` > 1min)

Alertas:
- `webhook_signature_fail` >10/min → posible ataque.
- `webhook_processing_failed` >5/min → algo roto, debug urgente.
- `webhook_pending_backlog` >100 → worker atorado.

### 9. Testing

- **Unit**: WebhookSignatureGuard con golden payloads firmados.
- **Integration**: enviar webhook real de Culqi sandbox → ver Payment capturado.
- **Adversarial**: webhook con timestamp viejo (debe fallar), firma incorrecta (debe fallar), event_id duplicado (debe ignorar segundo), payload manipulado (HMAC falla).
- **Chaos**: mata el proceso a medio procesar → al reiniciar, retry encuentra `pending` y lo termina.

## Consequences

- ✅ Confirmación de pagos automática, sin polling al adquirente.
- ✅ Inmune a replay, signature forgery, duplicación.
- ✅ Idempotencia garantizada — provider puede reenviar lo que quiera.
- ✅ Transaccional — estado consistente o rollback total.
- ✅ Rotación de secrets sin downtime.
- ✅ Alertas tempranas a ataque detectado.
- ⚠️ Requiere disciplina en NO parsear JSON antes del HMAC verify (middleware específico).
- ⚠️ Cada provider tiene su formato de header (Culqi: `X-Culqi-Signature`, MP: `x-signature` + `x-request-id`). Adapter por provider en `extractEventId` y `PROVIDER_SIG_HEADER`.
- 🔓 Riesgo abierto: webhook llega antes de que el `Payment` exista en BD (race entre `.initiate()` y notificación). Mitigación: en `resolvePayment` buscar por `provider_tx_id`, si no existe persistir webhook como `pending` y procesar cuando `Payment` se cree (correlación por `tx_id`).
- 🔓 Riesgo abierto: provider que no firma webhooks (raro, pero algunos antiguos). Mitigación: NO usarlo. Si no hay alternativa, validar IP allowlist + secret en query string (peor pero algo).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. Solo IP allowlist sin HMAC | NAT + IP spoofing internos lo derrotan. HMAC es la primary. |
| B. Polling al adquirente cada 30s | Carga API del provider + latency mala + cuotas. Webhooks son el estándar. |
| C. Procesar webhook síncrono dentro del request | Timeout del provider en transacción larga → reenvíos infinitos. Async + persist + retry gana. |
| D. Sin idempotency table (confiar en provider no duplicar) | Falsa premisa — todos los providers documentan que pueden duplicar. Sin idempotency = doble captura. |
| E. Compartir un secret entre tenants | Compromiso de uno = compromiso de todos. Por-tenant es obligatorio. |
| F. JWT en webhook payload en vez de HMAC | Algunos providers no soportan firmar con JWT custom. HMAC-SHA256 es universal. |

## Implementation plan

1. Schema `webhook_events` con UNIQUE `(provider, event_id)` (DBA, SIS-XX).
2. Middleware `rawBody` parser en NestJS (Backend Dev).
3. `WebhookSignatureGuard` parametrizable por provider (Backend Dev).
4. `WebhookDispatcher` con upsert idempotente + procesamiento async (Backend Dev).
5. Adapter por provider para `extractEventId`, headers, secret resolution (Backend Dev, dentro de `modules/payments/infrastructure/webhooks/`).
6. Endpoint configurable por tenant en settings (`webhookSecret` rotation) (Frontend + Backend).
7. Job de retry para `webhook_events.processingStatus='failed'` con backoff (Backend Dev).
8. Métricas + alertas (per [[016]]) (Backend + DBA).
9. Tests adversarial (QA + Security).

## References

- [[005-sale-concurrency]] · [[012-sunat-production-hardening]] · [[016-observability-and-audit]] · [[017-fast-checkout-unified]] · [[018-payments-unified]]
- dev.to — Webhook Security Best Practices 2025-2026: https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n
- Apidog — Webhook Signature Verification: https://apidog.com/blog/webhook-signature-verification/
- Hooklistener — Webhook Security HMAC: https://www.hooklistener.com/learn/webhook-security-fundamentals
- Hookdeck — SHA256 Webhook Signature Verification: https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification
- InventiveHQ — Webhook Signature Verification Guide: https://inventivehq.com/blog/webhook-signature-verification-guide
- Stripe webhooks (referencia estándar): https://stripe.com/docs/webhooks
- MercadoPago — Notificaciones: https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications
- Culqi — Webhooks: https://docs.culqi.com/es/documentacion/webhooks/
