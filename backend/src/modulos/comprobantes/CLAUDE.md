# CLAUDE.md — Módulo Comprobantes (Receipts)

> Léelo antes de tocar este código.

## Qué hace

Emite y administra **comprobantes** (ticket interno, boleta, factura, nota crédito/débito) asociados a ventas.

**MVP actual**: numeración correlativa local + payload JSON listo para imprimir.
**Fase 4 (futuro)**: integración SUNAT (Perú) y SENIAT (Venezuela) — usa el código propio de Roberto, NO API tercero.

## Bounded context

- **Receipt** (header): tipo + serie + número correlativo único por `(tenant, location, type, series, number)`
- Snapshot de datos del cliente al momento de emisión (`customerDocNumber`, `customerName`)
- `payloadJson` cachea estructura serializable para reimpresión sin re-querying

## Reglas inviolables

1. **Solo ventas en `completed`** pueden emitir comprobante
2. **Multi-tenant**: todo query filtra por `tenantId`
3. **Numeración correlativa por serie**: `B001-00000001`, `B001-00000002`, ... — se obtiene dentro de transacción con `MAX + 1` para evitar duplicados (la UNIQUE en BD blinda)
4. **Una venta puede tener N comprobantes** (boleta + nota crédito posterior)
5. **Anular ≠ borrar**: status pasa a `voided`, no DELETE
6. **Money con `Decimal`**: snapshot del total al emitir
7. **Series por tipo y país** (sugerido):
   - `T001` ticket interno (cualquier país)
   - `B001` boleta (PE) o factura simple (VE)
   - `F001` factura (PE/VE)
   - `BC01` nota crédito sobre boleta
   - `FC01` nota crédito sobre factura

## Endpoints

| Método | Ruta | Rol mínimo |
|---|---|---|
| `POST /api/v1/comprobantes/emitir` | emitir comprobante para una venta | `operator` |
| `POST /api/v1/comprobantes/:id/anular` | anular | `location_manager` |
| `GET /api/v1/comprobantes` | listar (filtros) | `operator` (solo lo propio) |
| `GET /api/v1/comprobantes/:id` | detalle + payload imprimible | `operator` |
| `GET /api/v1/comprobantes/:id/payload` | solo payload JSON (para frontend imprimir) | `operator` |

## payload JSON imprimible

Cachea un objeto serializable que el frontend pinta como HTML imprimible:

```json
{
  "tenant":   { "name": "Bodega La Esquina", "address": "...", "ruc": "..." },
  "location": { "name": "Sucursal Principal", "address": "..." },
  "type":     "boleta",
  "serie":    "B001",
  "number":   "00000123",
  "issuedAt": "2026-05-20T17:30:00Z",
  "customer": { "docType": "DNI", "docNumber": "12345678", "name": "..." },
  "items":    [{ "sku": "...", "name": "...", "qty": 2, "unitPrice": 3.50, "lineTotal": 7.00 }],
  "subtotal": 100.00,
  "tax":      18.00,
  "total":    118.00,
  "currency": "PEN",
  "paymentMethods": ["cash"]
}
```

El frontend toma esto y renderiza HTML para imprimir (window.print). NO se genera PDF en backend — eso es responsabilidad del cliente (o futuro servicio aparte).

## Anti-patrones

- ❌ Borrar comprobantes (siempre `voided`)
- ❌ Numeración no atómica (race condition → duplicados)
- ❌ Emitir comprobante sobre venta `draft` o `cancelled`
- ❌ Modificar `series` y `number` después de emitir
- ❌ Olvidar el snapshot del cliente — si después borras el Contact, el comprobante histórico debe seguir mostrando el nombre

## Próximas iteraciones

- Fase 4: Adapter SUNAT (`IFiscalEmitter`) — envía XML firmado, recibe CDR, actualiza `status` y `externalCode`
- Fase 4: Adapter SENIAT (igual para Venezuela)
- Cron de reenvío para comprobantes en `rejected` o sin CDR
