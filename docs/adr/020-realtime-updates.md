# ADR-020: Actualizaciones en tiempo real — Postgres LISTEN/NOTIFY + SSE

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-60

## Context

Minimarket con 3 cajas vendiendo simultáneo. Caso real:

- Cajero A vende el último item de una variante → stock baja a 0.
- Cajero B ve "stock: 1" en su pantalla porque su carrito no se enteró.
- Cajero B intenta vender → falla con `InsufficientStockError`.
- UX mala, retrabajo.

Otros casos que ameritan tiempo real:

- Cajero A abre un turno → otros cajeros ven que la caja N está ocupada.
- Manager autoriza una devolución pendiente → cajero ve el botón habilitarse.
- Comprobante emitido por SUNAT → UI cambia status de `pending` → `accepted` sin refresh.
- Inventario ajustado por DBA → todas las pantallas se actualizan.

Decisiones abiertas:

- **¿WebSocket o SSE?** WebSocket es bidireccional (overkill — el cliente no envía nada). SSE es unidireccional y más simple.
- **¿Message broker (Redis Pub/Sub, RabbitMQ, NATS)?** O **¿Postgres nativo LISTEN/NOTIFY?**
- **¿Cuándo notificar?** ¿En el `UPDATE` (peligroso, antes del COMMIT) o post-COMMIT (consistente)?
- **¿Granularidad?** ¿Un canal por tenant? ¿Por location? ¿Por entidad?
- **¿Fallback?** Si SSE no funciona (proxy bloquea, browser viejo), ¿polling?
- **¿Authorization?** ¿Cómo evitar que un tenant escuche eventos de otro?

## Decision

### 1. **Postgres LISTEN/NOTIFY + SSE** — sin broker adicional en MVP

Stack:

```
Postgres trigger ON UPDATE → NOTIFY 'inventory_<tenantId>' payload (json)
              ↓
NestJS service con conexión dedicada LISTEN 'inventory_<tenantId>'
              ↓
EventEmitter2 interno del Nest
              ↓
SSE endpoint /api/v1/realtime/stream → cliente browser
              ↓
React hook useRealtimeChannel() → state update
```

Razones vs alternativas:

- **No agregamos Redis al MVP** ([[013-deploy-environments-cicd]] difiere Redis a "fase 4"). Postgres ya está. Una conexión LISTEN cuesta ~1MB RAM. Para volumen MVP (decenas de tenants) sobra.
- **SSE > WebSocket** porque comunicación es unidireccional (server → client). [Pedro Alonso — Postgres LISTEN/NOTIFY Real-Time](https://www.pedroalonso.net/blog/postgres-listen-notify-real-time/) y [Tom Catshoek — Postgres NOTIFY/LISTEN + SSE](https://tom.catshoek.dev/posts/postgres-sse/) documentan este patrón en producción.
- **Librería NestJS**: [`nestjs-pg-pubsub`](https://medium.com/@mciissee/building-real-time-applications-with-postgresql-and-nestjs-using-nestjs-pg-pubsub-db724187df3f) maneja la conexión dedicada + multiplexing entre múltiples LISTEN.

Migración futura a Redis Pub/Sub o NATS si llegamos a ~500+ tenants concurrent — interface `IRealtimeBroker` se mantiene, swap del adapter.

### 2. Trigger Postgres — NOTIFY post-COMMIT

```sql
CREATE OR REPLACE FUNCTION notify_inventory_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'inventory_' || NEW.tenant_id::text,
    json_build_object(
      'event', 'stock_changed',
      'variantId', NEW.variant_id,
      'locationId', NEW.location_id,
      'quantity', NEW.quantity,
      'availableQuantity', NEW.available_quantity,
      'at', NEW.updated_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_stock_notify
AFTER UPDATE OF quantity, available_quantity ON inventory_stock
FOR EACH ROW EXECUTE FUNCTION notify_inventory_change();
```

**Crítico — transaccionalidad**:

- `NOTIFY` dentro de transacción **se difiere hasta el COMMIT** ([PostgreSQL docs](https://www.postgresql.org/docs/current/sql-notify.html)). Si la transacción hace ROLLBACK, no se envía nada. Esto es **exactamente lo que queremos**: no notificar cambios que no se materializaron.
- Por eso usamos `AFTER UPDATE` (post-statement) — el trigger se encola y se ejecuta al final.
- El payload va serializado (max 8000 bytes por NOTIFY) — para payloads grandes, enviar solo `{event, entityId}` y el cliente hace fetch del detalle.

Triggers similares en:

- `cash_shifts` (abrir/cerrar/aprobar diff)
- `receipts` (status change: pending → accepted/rejected)
- `returns` (creada, aprobada, rechazada)
- `outbox_events` (para que el worker reaccione sin polling — alternativa al cron de [[005]])

### 3. Canales — uno por (tenant, dominio)

Convención: `<dominio>_<tenantId>`. Ejemplos:

- `inventory_03e71789-4c55-4ddf-8014-ec6a5277a867`
- `receipts_03e71789-4c55-4ddf-8014-ec6a5277a867`
- `shifts_03e71789-4c55-4ddf-8014-ec6a5277a867`

**Aislamiento por tenant garantizado** — un cliente solo se suscribe a canales de su `tenantId` (resuelto del JWT, no del cliente).

NO usamos un canal global `inventory` con filtrado en app — sería N×M payloads recibidos y filtrados, mata performance.

### 4. SSE endpoint — `/api/v1/realtime/stream`

```ts
@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly broker: IRealtimeBroker) {}

  @Sse('stream')
  stream(@UsuarioActual() user: JwtPayload, @Query('topics') topics: string): Observable<MessageEvent> {
    // topics='inventory,receipts,shifts' — qué canales escuchar
    const requested = topics.split(',');
    return this.broker.subscribeForTenant(user.tenantId, requested).pipe(
      map(event => ({ data: event } as MessageEvent)),
    );
  }
}
```

NestJS soporta SSE nativo con `@Sse()` decorator + `Observable<MessageEvent>`. El RxJS observable maneja unsubscribe automático cuando el cliente cierra.

### 5. Frontend — `useRealtimeChannel()` hook

```ts
function useRealtimeChannel<T>(topic: string, onEvent: (event: T) => void) {
  useEffect(() => {
    const es = new EventSource(`/api/v1/realtime/stream?topics=${topic}`, { withCredentials: true });
    es.onmessage = (e) => onEvent(JSON.parse(e.data));
    es.onerror = () => { /* reconnect handled by browser auto */ };
    return () => es.close();
  }, [topic, onEvent]);
}

// uso en POS:
useRealtimeChannel<StockEvent>('inventory', (evt) => {
  queryClient.setQueryData(['stock', evt.variantId, evt.locationId], evt);
});
```

**Integración con TanStack Query** ([[010-frontend-architecture]]): el evento actualiza la cache directamente, todos los componentes que usen `useStockQuery(variantId)` re-renderizan.

EventSource maneja reconnect automático con backoff. Si el server cae 30s, browser retoma sin código adicional.

### 6. Fallback — polling si SSE no disponible

Casos donde SSE puede fallar:

- Proxy corporativo cierra conexiones long-lived.
- Browser muy antiguo (raro en target POS).
- Buffer del navegador con HTTP/1.1 (max 6 SSE conexiones por origin).

Fallback automático: si `EventSource` falla 3 veces seguidas (`onerror`) → switch a polling cada 5s del endpoint `GET /api/v1/realtime/snapshot?topics=...&since=...`. Misma cache update, peor latency.

Detección en `useRealtimeChannel`: hook expone `{ mode: 'sse' | 'polling' | 'disconnected' }` y muestra indicador en la UI.

### 7. Authorization y RLS

- Cada `subscribeForTenant(tenantId, topics)` valida que el JWT tenga ese tenantId.
- El handler LISTEN del backend agrupa por tenant. Un evento NOTIFY de `inventory_<tenantA>` jamás llega a clientes de `tenantB`.
- Si se compromete una conexión SSE — solo expone eventos del tenant de ese token. **El daño está acotado al tenant.**
- Triggers Postgres no filtran por RLS (los triggers corren con privilegios del owner). El filtrado se hace al SUBSCRIBE en NestJS, donde sí tenemos `tenantId` del JWT validado.

### 8. Volumen y backpressure

Por tenant esperado MVP:

- ~5 cajas vendiendo → ~10 stock updates / minuto en hora pico.
- ~5 receipts emitidos / minuto.
- Total ~25 NOTIFY/min/tenant. A 100 tenants concurrentes = ~2500 NOTIFY/min. **Trivial para Postgres.**

Si en el futuro un tenant rompe esto (ej. importa CSV de 5000 productos → 5000 NOTIFY) — agregar **debouncing** server-side: agrupar eventos en ventanas de 200ms antes de enviar al SSE.

### 9. Transaccionalidad — NOTIFY post-COMMIT por design de Postgres

El `pg_notify()` dentro de trigger AFTER se difiere hasta COMMIT exitoso ([PostgreSQL docs — NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)). Garantías:

- Si la transacción COMMITEA → NOTIFY se envía.
- Si la transacción ROLLBACKea → NOTIFY se descarta.
- Si Postgres crashea entre COMMIT y NOTIFY → NOTIFY se pierde (raro pero posible).

**Mitigación al último caso**: el cliente SSE incluye `Last-Event-ID` (estándar EventSource), el server lo usa para detectar gap y enviar snapshot de "lo que cambió desde T". Tabla auxiliar `realtime_event_log` (TTL 1 hora) registra eventos para replay si hace falta.

### 10. Reconexión y dedup

EventSource reconecta automático. El server envía `Last-Event-ID` con cada evento. Al reconectar, el cliente lo envía como header → server responde con eventos desde ese ID.

Para evitar duplicados (eventos enviados dos veces por race entre reconexión y nuevo evento), el cliente mantiene un `Set<eventId>` de últimos 100 procesados.

## Consequences

- ✅ Tiempo real entre cajeros sin agregar Redis al stack — Postgres ya está.
- ✅ Consistencia transaccional garantizada por design (NOTIFY post-COMMIT).
- ✅ Aislamiento tenant por canal `<dominio>_<tenantId>`.
- ✅ Reconexión + fallback polling cubren proxies hostiles.
- ✅ Integración limpia con TanStack Query — cache update + re-render automático.
- ⚠️ Una sola instancia backend = una conexión LISTEN para todos los canales del tenant. Escalado horizontal requiere que CADA réplica del backend mantenga su LISTEN — duplicación de mensajes en la app pero idempotency natural (mismo evento se procesa N veces sin daño porque el cliente solo tiene una EventSource).
- ⚠️ Triggers Postgres agregan latencia ~0.5-1ms al UPDATE. Aceptable.
- 🔓 Riesgo abierto: si el broker NestJS crashea, eventos en vuelo se pierden hasta reconectar Postgres LISTEN. Mitigación: `realtime_event_log` + replay via Last-Event-ID.
- 🔓 Riesgo abierto: Neon (Postgres serverless) escala-a-zero puede romper conexión LISTEN persistente. **Verificar comportamiento de Neon** antes de prod. Alternativa: usar Neon "always-on" branch para prod ($).

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. WebSocket bidireccional | Innecesario — cliente no envía nada. SSE es más simple y suficiente. |
| B. Polling cada 2s | Carga BD inútil + latencia mala. Solo como fallback. |
| C. Redis Pub/Sub | Requiere Redis (cost + ops). Postgres NOTIFY cubre MVP. Mantenemos interface para swap futuro. |
| D. RabbitMQ / NATS | Misma razón + más complejidad. Para escala >>1000 tenants reconsiderar. |
| E. Trigger BEFORE COMMIT | Notificaría cambios que pueden hacer rollback. Bug. |
| F. Un canal global con filtering en app | N×M payloads + filtering = mata perf. Canal por tenant gana. |
| G. Server-side polling (sin SSE) | Re-implementar todo lo que browser ya da gratis (reconnect, Last-Event-ID). |

## Implementation plan

1. Migraciones Postgres: funciones + triggers `notify_*` en `inventory_stock`, `cash_shifts`, `receipts`, `returns` (DBA, SIS-XX).
2. `modules/realtime/` con `IRealtimeBroker` port + `PostgresListenBroker` adapter usando `nestjs-pg-pubsub` (Backend Dev).
3. `RealtimeController` con `@Sse('stream')` endpoint (Backend Dev).
4. Frontend `useRealtimeChannel()` hook + integración TanStack Query (Frontend Dev).
5. Banner UI "Conexión en tiempo real activa / Modo lento (polling)" (Frontend Dev).
6. `realtime_event_log` tabla TTL 1h + endpoint replay `/api/v1/realtime/replay?since=...` (Backend Dev + DBA).
7. Verificar comportamiento Neon con conexión LISTEN persistente — testbed (Architect).
8. Tests: stock cambia en cajero A → cajero B lo ve <500ms (E2E con dos sesiones); rollback no notifica; reconnect tras kill backend (QA).

## References

- [[005-sale-concurrency]] · [[009-cash-shifts]] · [[010-frontend-architecture]] · [[013-deploy-environments-cicd]] · [[016-observability-and-audit]]
- PostgreSQL docs — LISTEN / NOTIFY: https://www.postgresql.org/docs/current/sql-notify.html
- Pedro Alonso — Postgres LISTEN/NOTIFY Real-Time: https://www.pedroalonso.net/blog/postgres-listen-notify-real-time/
- Mamadou Cisse — NestJS Postgres LISTEN/NOTIFY pg-pubsub: https://medium.com/@mciissee/building-real-time-applications-with-postgresql-and-nestjs-using-nestjs-pg-pubsub-db724187df3f
- Tom Catshoek — Postgres NOTIFY/LISTEN + SSE: https://tom.catshoek.dev/posts/postgres-sse/
- Spin Atomic Object — Postgres LISTEN/NOTIFY + SSE: https://spin.atomicobject.com/postgres-listen-notify-events/
- MDN — Server-Sent Events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- NestJS — Server-Sent Events: https://docs.nestjs.com/techniques/server-sent-events
