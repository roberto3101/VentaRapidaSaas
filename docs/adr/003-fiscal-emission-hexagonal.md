# ADR-003: SUNAT / SENIAT — aislamiento vía Hexagonal (Ports & Adapters)

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

La emisión de comprobantes fiscales es el corazón regulatorio del producto y la fuente del mayor riesgo técnico:

- El cliente exige **código propio** (no NubeFact ni similares) para firmar XML, comunicarse con SUNAT-OSE y SENIAT.
- Las reglas cambian cada año (Resoluciones de Superintendencia, Providencias). El acople de lógica fiscal a casos de uso de venta sería un dolor crónico.
- Necesitamos poder hacer **dry-run** (emitir comprobante de prueba sin enviar al ente fiscal) para QA continuo.
- En el futuro podríamos soportar OSEs externos como modo "fallback" o para tenants enterprise que ya tienen contrato.

El código actual **no tiene módulos fiscales** — el dominio de receipts/venta no existe aún. Tenemos la oportunidad de hacerlo bien desde el inicio.

## Decision

Aplicamos **Hexagonal Architecture** estricto en el bounded context `receipts/`:

### Puerto principal

```ts
// modules/receipts/application/ports/fiscal-emitter.port.ts
export interface IFiscalEmitter {
  emit(receipt: Receipt): Promise<EmissionResult>;
  voidReceipt(receipt: Receipt, reason: string): Promise<VoidResult>;
  generatePdf(receipt: Receipt): Promise<Buffer>;
  consultStatus(receipt: Receipt): Promise<EmissionStatus>;
}

export interface EmissionResult {
  status: 'accepted' | 'rejected' | 'pending';
  hashCode: string;
  signedXml?: string;
  cdr?: string;
  errorCode?: string;
  errorMessage?: string;
  emittedAt: Date;
}
```

### Adapters concretos (uno por régimen)

```
modules/receipts/infrastructure/adapters/
├── sunat/
│   ├── sunat-fiscal-emitter.adapter.ts        ← implementa IFiscalEmitter
│   ├── ubl/                                   ← serializadores UBL 2.1
│   ├── signing/                               ← firma XAdES con certificado del tenant
│   ├── transport/                             ← cliente HTTP a SUNAT-OSE
│   └── catalog/                               ← códigos SUNAT (catalogos 1, 7, 51, etc.)
├── seniat/
│   └── ... (estructura análoga)
└── dryrun/
    └── dryrun-fiscal-emitter.adapter.ts        ← emite sin enviar, retorna éxito simulado. Usado en QA + dev local.
```

### Factory de selección

El use case `EmitReceiptUseCase` recibe un `IFiscalEmitterFactory`, NO un emitter concreto:

```ts
class EmitReceiptUseCase {
  async execute(saleId: string) {
    const sale = await this.saleRepo.find(saleId);
    const tenant = await this.tenantRepo.find(sale.tenantId);
    const emitter = this.emitterFactory.for(tenant.countryCode, tenant.fiscalMode); // 'production' | 'sandbox' | 'dryrun'
    const result = await emitter.emit(receiptFrom(sale));
    await this.receiptRepo.persistEmission(result);
    this.eventBus.publish(new ReceiptEmittedEvent(...));
  }
}
```

### Reglas inviolables

1. **El use case nunca importa SUNAT/SENIAT directamente.** Solo el factory + el port.
2. **El módulo `sales/` no importa `receipts/sunat/` ni `receipts/seniat/`.** Comunicación vía dominio events: `SaleCompleted` → handler en `receipts/` arma y emite el comprobante.
3. **El XML firmado y el CDR se persisten** en `Receipt.signedXml` y `Receipt.cdr` (BLOB / text) para auditoría obligatoria.
4. **Reintentos**: si SUNAT/SENIAT no responde, el `EmissionResult` queda `pending`. Job worker reintenta con backoff exponencial (BullMQ). El estado `pending` es válido y la venta no se bloquea — el comprobante físico se entrega después.
5. **Idempotencia**: cada emisión lleva un `idempotencyKey = receiptId`. Reintentos no duplican comprobantes en SUNAT.
6. **Modo dryrun**: tenant nuevo arranca en `fiscalMode = 'sandbox'` (envía al endpoint sandbox de SUNAT/SENIAT). Tenant en producción activa `fiscalMode = 'production'` solo cuando aprueba checklist (certificado válido, RUC habilitado, etc.).
7. **Certificados**: el certificado digital del cliente (.pfx o equivalente) se almacena cifrado at-rest. La clave de cifrado proviene de KMS/secret manager — nunca en BD plana. ADR de KMS pendiente.

## Consequences

### Positivas

- Cambio regulatorio de SUNAT solo toca `adapters/sunat/` — el resto del sistema no se entera.
- QA puede correr E2E completos sin enviar nada real a SUNAT, usando `dryrun`.
- Día que un tenant pide usar NubeFact como fallback → nuevo adapter `NubefactExternalAdapter`, factory lo selecciona si `tenant.useExternalOse = true`.
- Aislamiento del código firmado: solo el adapter SUNAT toca certificados. Auditoría de seguridad localizada.

### Negativas

- Más archivos y carpetas que un "solo módulo SUNAT inline". Lo absorbemos a cambio de mantenibilidad.
- El factory debe registrarse en el `ReceiptsModule` correctamente para inyección. Documentar pattern en `modules/receipts/CLAUDE.md`.
- Almacenar XML/CDR puede crecer mucho. Plan: archive a S3 después de 6 meses, mantener pointer en BD.

### Riesgos abiertos

- **Implementar firma XAdES correctamente** es complejo. Riesgo técnico alto. Mitigación: usar librería madura (xadesjs o equivalente JVM si llegáramos a usar microservicio Java solo para firma).
- **SUNAT-OSE tiene caída esporádica** — los reintentos deben estar bien probados. Mitigación: dashboard ops para monitor.
- **Diferencia regulatoria PE vs VE** mayor de lo previsto. Mitigación: validar con contador local antes de lanzar VE.

## Alternatives considered

### A. Llamar SUNAT directo desde `SalesService`

- **Contras**: acopla venta a estado de SUNAT. Si SUNAT cae, no se vende. Inaceptable.

### B. Usar NubeFact / Apisperu como única vía

- **Contras**: el cliente lo prohibió explícitamente. Dependencia externa, costos, posibles cortes.

### C. Microservicio fiscal aparte ya desde día 1

- **Contras**: overhead operacional alto. Reservamos para cuando carga lo justifique. La hexagonal permite extraerlo después sin tocar dominio.

### D. Compartir más código entre SUNAT y SENIAT (jerarquía de clases)

- **Contras**: las semánticas son MUY distintas. Cualquier "clase base fiscal" termina llena de `if (country === ...)` — anti-pattern. Mejor adapters independientes con duplicación aceptable (regla de [[001]]).

## Implementation plan

1. Definir interfaz `IFiscalEmitter` y tipos (Backend Dev, SIS-XX).
2. Implementar `DryrunFiscalEmitterAdapter` primero (rápido, desbloquea QA).
3. Implementar `SunatFiscalEmitterAdapter` (Architect + Roberto, código propio).
4. `SeniatFiscalEmitterAdapter` fase siguiente.
5. Job worker de reintentos con BullMQ (cuando lleguemos a Redis — ver roadmap fase 4).
6. Tests E2E `sales → receipts → dryrun` antes de producción.

## References

- UBL 2.1: http://docs.oasis-open.org/ubl/UBL-2.1.html
- SUNAT estructura CPE: https://cpe.sunat.gob.pe/
- xadesjs: https://github.com/PeculiarVentures/xadesjs
- [[002-multi-country-strategy]]
- [[005-sale-concurrency]]
