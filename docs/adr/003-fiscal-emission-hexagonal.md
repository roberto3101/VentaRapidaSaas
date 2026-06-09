# ADR-003: SUNAT / SENIAT — aislamiento vía Hexagonal (Ports & Adapters)

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

La emisión de comprobantes fiscales es el corazón regulatorio del producto y la fuente del mayor riesgo técnico:

- El cliente exige **stack propio sin depender de OSEs comerciales de pago** (NubeFact, APIsPERU, APISUNAT, etc.). Razón: no hay presupuesto recurrente y queremos control end-to-end. **Decisión técnica**: usamos **Greenter** ([GitHub thegreenter/greenter](https://github.com/thegreenter/greenter)), librería PHP open-source madura y mantenida por la comunidad peruana, que genera XML UBL 2.0/2.1, firma XAdES-BES con cert del tenant, envía a webservices SUNAT por SOAP y procesa el CDR. Greenter NO es un OSE — es una librería que corre en infraestructura propia.
- Las reglas cambian cada año (Resoluciones de Superintendencia, Providencias). El acople de lógica fiscal a casos de uso de venta sería un dolor crónico.
- Necesitamos poder hacer **dry-run** (emitir comprobante de prueba sin enviar al ente fiscal) para QA continuo.
- Stack heterogéneo (PHP para Greenter, NestJS para el resto): el aislamiento hexagonal nos permite encapsular el adapter PHP detrás de un port HTTP REST sin contaminar el dominio.

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
│   ├── sunat-fiscal-emitter.adapter.ts        ← implementa IFiscalEmitter — delega a microservicio PHP Greenter vía HTTP REST
│   ├── greenter-client.ts                     ← cliente HTTP al microservicio (POST /invoice, /boleta, /credit-note, etc.)
│   ├── catalog/                               ← códigos SUNAT (catalogos 1, 7, 51, etc.) — mantenidos en NestJS para validación temprana antes de enviar al microservicio
│   └── mappers/                               ← Sale → InvoiceInput (DTO JSON que entiende Greenter)
├── seniat/
│   └── ... (estructura análoga — adapter VE pendiente, ver [[002-multi-country-strategy]])
└── dryrun/
    └── dryrun-fiscal-emitter.adapter.ts        ← emite sin enviar, retorna éxito simulado. Usado en QA + dev local.
```

**Microservicio externo PHP (`fiscal-php/`)** — repositorio o subcarpeta separada del repo principal:

```
fiscal-php/
├── Dockerfile                                 ← PHP 8.2 + extensiones soap, zlib, openssl, curl
├── composer.json                              ← greenter/greenter ^5
├── src/                                       ← thin wrapper REST sobre Greenter
│   ├── routes.php                             ← POST /invoice, /boleta, /credit-note, /debit-note, /summary, /void
│   ├── controllers/
│   └── certificate-store.php                  ← descifra .pfx (recibe blob + key del adapter NestJS)
└── tests/                                     ← golden XML tests
```

Se puede partir de **Lycet** ([GitHub giansalex/lycet](https://github.com/giansalex/lycet)) — REST API basada en Greenter + Symfony con Docker-ready — adaptando endpoints, o construir el wrapper minimalista con Slim/Lumen. La elección concreta queda en [[012-sunat-production-hardening]] §2.

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
- Día que un tenant enterprise pida usar un OSE certificado de pago como fallback (NubeFact, APISUNAT, etc.) → nuevo adapter `ExternalOseAdapter` con interfaz idéntica, factory lo selecciona si `tenant.useExternalOse = true`. No es plan MVP — Greenter cubre el caso.
- Aislamiento del código firmado: solo el adapter SUNAT toca certificados. Auditoría de seguridad localizada.

### Negativas

- Más archivos y carpetas que un "solo módulo SUNAT inline". Lo absorbemos a cambio de mantenibilidad.
- El factory debe registrarse en el `ReceiptsModule` correctamente para inyección. Documentar pattern en `modules/receipts/CLAUDE.md`.
- Almacenar XML/CDR puede crecer mucho. Plan: archive a S3 después de 6 meses, mantener pointer en BD.

### Riesgos abiertos

- **Firma XAdES correcta** es delegada a Greenter (librería con uso productivo masivo en Perú). Riesgo de adopción bajo. Ver [[012-sunat-production-hardening]] §2 para detalles del cert handling.
- **SUNAT tiene caída esporádica** — los reintentos deben estar bien probados. Mitigación: dashboard ops para monitor y outbox pattern ([[005-sale-concurrency]] §Capa 2).
- **Greenter en mantenimiento** — la librería es comunitaria. Riesgo: cambios regulatorios SUNAT no incorporados a tiempo. Mitigación: monitorear releases del repo + contribuir patches propios si urge; nuestro código en `mappers/` aísla cambios de schema en los DTOs de entrada.
- **Diferencia regulatoria PE vs VE** mayor de lo previsto. SENIAT no tiene equivalente a Greenter — adapter VE entra como riesgo de implementación. Mitigación: validar con contador local antes de lanzar VE.

## Alternatives considered

### A. Llamar SUNAT directo desde `SalesService`

- **Contras**: acopla venta a estado de SUNAT. Si SUNAT cae, no se vende. Inaceptable.

### B. Usar NubeFact / APIsPERU / APISUNAT como única vía

- **Contras**: presupuesto recurrente que no tenemos. NubeFact mínimo S/40/mes para 500 docs ([NubeFact Precios](https://www.nubefact.com/precios)). A 50 tenants pagados × S/40 = $500+/mes solo en facturación. Dependencia externa con riesgo de cortes en su SLA. Greenter es free + auto-hosted.

### B.bis. Implementar firma XAdES nativa en Node.js con `xadesjs`

- **Pros**: stack uniforme TypeScript end-to-end, sin microservicio adicional.
- **Contras**: `xadesjs` ([GitHub PeculiarVentures/xadesjs](https://github.com/PeculiarVentures/xadesjs)) es genérico, no específico SUNAT. Implementar canonicalización C14N + namespaces UBL correctos manualmente es semanas de trabajo + tests contra rechazo SUNAT. Greenter ya lo resolvió y tiene años de uso productivo. Descartado por costo/beneficio.

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
- Greenter (librería oficial): https://github.com/thegreenter/greenter
- Greenter docs (webservices SUNAT): https://fe-primer.greenter.dev/docs/webservices/
- Lycet (REST API basada en Greenter, Docker-ready): https://github.com/giansalex/lycet
- [[002-multi-country-strategy]]
- [[005-sale-concurrency]]
- [[012-sunat-production-hardening]]
