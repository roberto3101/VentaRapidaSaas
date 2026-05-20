# ADR-002: Multi-country strategy (PE + VE, abierto a CO/BO/EC)

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

SistemaVentaRapida Pro debe operar de día 1 en **Perú** y **Venezuela**, y sumar Colombia/Bolivia/Ecuador en fases siguientes sin reescribir el core. Diferencias entre países que el sistema debe absorber:

| Dimensión | PE | VE | Pendiente CO/BO/EC |
|---|---|---|---|
| Régimen fiscal | SUNAT | SENIAT | DIAN / SIN / SRI |
| Documento identidad personas | DNI | CI | CC / CI / Cédula |
| Documento identidad empresas | RUC (11 dígitos) | RIF (letra + 9 dígitos) | NIT / NIT / RUC |
| Comprobantes legales | Boleta / Factura / Nota crédito / Nota débito / Guía remisión | Factura única / Nota crédito / Nota débito | Múltiples |
| Impuesto principal | IGV 18% | IVA 16% | IVA 19% / IVA 13% / IVA 12% |
| Moneda nativa | PEN | VES (+USD paralelo) | COP / BOB / USD (EC) |
| Formato fecha UI | DD/MM/YYYY | DD/MM/YYYY | DD/MM/YYYY |
| Separador decimal | coma o punto (regional) | coma | coma |
| Zona horaria | America/Lima | America/Caracas | varios |
| Régimen de retención | Sí (algunos) | Sí | Varía |

El código actual tiene `countryCode` en `Tenant` y `Location` pero **toda la lógica de negocio asume PE** (IGV 18% hardcoded, etiquetas legales en español-PE, sin adaptador SENIAT).

## Decision

Combinamos **dos mecanismos**:

1. **Configuración por país** (data-driven) para reglas declarativas: tasas de impuesto, formatos, longitudes de documento, símbolo de moneda, zona horaria, calendarios fiscales.
2. **Strategy pattern via Ports & Adapters** para comportamiento ejecutable distinto: emisión fiscal, validación de identificadores, reglas de redondeo, generación de XML/UBL.

### Mecanismo 1: Country catalog (configuración)

Nuevo módulo `modules/countries/` con:

- Tabla `countries` (catálogo seed, no editable por tenant):
  - `code` (PK), `name`, `defaultCurrency`, `defaultTimezone`, `dateFormat`, `numberFormat`, `taxName`, `defaultTaxRate`, `isActive`.
- Tabla `country_document_types`: tipos de documento permitidos por país (`PE → DNI, RUC, CE, PASSPORT`; `VE → CI, RIF, PASSPORT`).
- Tabla `country_receipt_types`: tipos de comprobante válidos por país (`PE → boleta, factura, nota_credito, nota_debito, guia_remision`; `VE → factura, nota_credito, nota_debito`).
- Tabla `country_tax_rates`: histórico de tasas de impuesto por país (permite cambios fiscales sin redeploy).

`Tenant.countryCode` referencia `countries.code`. Toda lógica que dependa de país consulta este catálogo, **no hardcodea**.

### Mecanismo 2: Strategy pattern por país

Cada port relevante tiene una implementación por país:

```
modules/receipts/
├── application/
│   └── ports/fiscal-emitter.port.ts          ← IFiscalEmitter
└── infrastructure/
    └── adapters/
        ├── sunat/sunat-fiscal-emitter.adapter.ts    ← PE
        └── seniat/seniat-fiscal-emitter.adapter.ts  ← VE
```

Selección del adapter en runtime:

```ts
@Injectable()
class FiscalEmitterFactory {
  constructor(
    private sunat: SunatFiscalEmitterAdapter,
    private seniat: SeniatFiscalEmitterAdapter,
  ) {}
  for(countryCode: string): IFiscalEmitter {
    switch (countryCode) {
      case 'PE': return this.sunat;
      case 'VE': return this.seniat;
      default: throw new UnsupportedCountryError(countryCode);
    }
  }
}
```

Mismo patrón para:

- `IIdentityDocumentValidator` (valida RUC, RIF, DNI, CI con checksum).
- `IRoundingPolicy` (redondeo de tributos).
- `ICurrencyFormatter` (formato presentación, ya hay diferencias menores).

### Validación dual frontend / backend

- Frontend recibe la lista de document types válidos vía `/api/v1/countries/{code}/document-types` cuando el cajero arma una venta.
- Validadores Zod en frontend tienen sus equivalentes class-validator en backend, ambos consumiendo la misma fuente (catálogo).
- i18n: `es-PE`, `es-VE` (mismo idioma, distintos términos legales — ver [[007-i18n-strategy]]).

## Consequences

### Positivas

- **Agregar Colombia** = 1 fila en `countries` + 1 adapter por port = 0 tocadas en el core.
- **Cambios fiscales** (ej. IGV pasa a 17%) = inserción de fila en `country_tax_rates`, sin redeploy.
- **Separación clara**: dev de SUNAT no toca dev de SENIAT.
- **Testabilidad**: cada adapter se testea aislado con tenants país-X.

### Negativas

- Más boilerplate inicial (factories, ports, adapters por feature multi-país).
- Cuidado con divergencia silenciosa: si una regla VE no se implementa, el adapter PE no la detecta — necesitamos test cross-country (matriz: feature × país).
- El catálogo `country_tax_rates` debe ser editable por super admin con auditoría — no por tenants.

### Riesgos abiertos

- Venezuela tiene **dos contabilidades reales** (VES y USD paralelo). Decisión sobre USD se delega a [[004-money-and-currency]].
- SENIAT tiene cambios regulatorios frecuentes (Providencias). El adapter debe versionarse (ej. `SeniatFiscalEmitterAdapterV2024`).

## Alternatives considered

### A. Hardcodear PE y "ver Venezuela después"

- **Contras**: contradice el alcance pedido. La inversión es mayor cuando se retrofittea.

### B. Forks de código por país (mono-repo con `backend-pe`, `backend-ve`)

- **Contras**: duplicación masiva, divergencia, doble deploy. Reservado SOLO para casos extremos (ej. requisitos regulatorios incompatibles, lo cual no es el caso).

### C. Microservicio fiscal por país

- **Contras**: prematuro. Decision en [[001-multi-tenancy-strategy]]: monolito modular hasta que un dominio lo justifique por carga.

## Implementation plan

1. Crear tablas `countries`, `country_document_types`, `country_receipt_types`, `country_tax_rates` (DBA, SIS-XX).
2. Seed inicial PE + VE con datos legales verificados.
3. Mover constantes hardcoded de IGV/IVA a consultas del catálogo.
4. Ports + dos adapters dummy para `IFiscalEmitter` (real en fases siguientes).
5. Test cross-country matrix en CI.

## References

- SUNAT facturación electrónica v2: https://www.sunat.gob.pe/ol-ti-itcpgem-beta/cpe/
- SENIAT régimen IVA: documentación oficial SENIAT
- [[003-fiscal-emission-hexagonal]]
- [[004-money-and-currency]]
- [[007-i18n-strategy]]
