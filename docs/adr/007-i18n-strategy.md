# ADR-007: Internacionalización (i18n) y localización

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

El producto se vende en países que comparten idioma (español) pero NO comparten:

- **Vocabulario legal**: "Boleta" (PE) vs equivalente en VE (factura única); "RUC" (PE) vs "RIF" (VE); "IGV" vs "IVA".
- **Formatos**: separador decimal (coma vs punto), formato de fecha, formato de teléfono.
- **Moneda y símbolo**: S/, Bs.
- **Calendarios fiscales**: SUNAT cierra el 30 de cada mes; SENIAT trimestral en algunos rubros.

El código actual:

- **Strings hardcoded en componentes**: ej. `'Buenos días'`, `'Productos'`, `'Mov. hoy'` (dashboard `page.tsx`). Imposible variar por país sin tocar componentes.
- No existe `frontend/lib/i18n/`.
- No hay locale negotiation — la UI asume es-PE por completo.
- Mensajes de error de backend en español hardcoded en services (ej. `'Credenciales incorrectas'` en `auth.service.ts:46`).

## Decision

### Estrategia general

1. **Idioma base único: español neutro LATAM**. No traducimos a inglés en UI (objetivo del producto es LATAM).
2. **Locales soportados**: `es-PE` (default), `es-VE`. Estructura abierta para `es-CO`, `es-BO`, `es-EC`.
3. **Locale activo viene de `Tenant.countryCode`** (no del browser). El cajero en Lima ve `es-PE`; el cajero en Caracas ve `es-VE` aunque su navegador esté en `en-US`. Override por usuario admin en settings (raro).
4. **Toda string visible al usuario** vive en archivos de traducción, no en componentes.
5. **Formato (fechas, números, moneda)**: API `Intl.*` del navegador parametrizada por locale del tenant.

### Frontend (Next.js)

```
frontend/lib/i18n/
├── index.ts                  ← hook useT() + provider
├── locales/
│   ├── es-PE/
│   │   ├── common.json       ← Save, Cancel, Confirm, Empty, ...
│   │   ├── pos.json
│   │   ├── inventory.json
│   │   ├── receipts.json     ← "Boleta", "Factura", "Nota de crédito"
│   │   └── settings.json
│   └── es-VE/
│       └── ... (mismas keys, traducciones VE)
└── format/
    ├── money.ts              ← formatMoney(amount, currency, locale)
    ├── date.ts               ← formatDate(date, locale)
    ├── number.ts
    └── document.ts           ← formatRUC, formatRIF, formatDNI, formatCI
```

Uso:

```tsx
const t = useT('receipts');
return <button>{t('emit_receipt')}</button>;
// → "Emitir comprobante"
```

Decisión técnica: usamos **react-intl** (formato ICU MessageFormat) — maduro, soporta pluralización y selectores que necesitaremos.

Alternativa más ligera: **next-intl** (más idiomático con App Router). Decisión final delegada al Frontend Dev al implementar, sin afectar este ADR. Lo importante es la estructura.

### Backend (NestJS)

Catálogo de mensajes de error en `common/i18n/`:

```ts
// common/i18n/errors.ts
export const ErrorMessages = {
  AUTH_INVALID_CREDENTIALS: {
    'es-PE': 'Credenciales incorrectas',
    'es-VE': 'Credenciales incorrectas',
  },
  STOCK_INSUFFICIENT: {
    'es-PE': 'Stock insuficiente. Disponible: {available}, solicitado: {requested}',
    'es-VE': 'Inventario insuficiente. Disponible: {available}, solicitado: {requested}',
  },
  ...
};
```

Exception filter global lee `tenant.locale` del request user (o `Accept-Language` fallback) y resuelve el mensaje. Services lanzan exceptions con `errorCode` enum, no string libre.

### Formato por locale

Tabla maestra:

| Concepto | es-PE | es-VE |
|---|---|---|
| Moneda default | PEN (S/) | VES (Bs) — también USD aceptado |
| Separador decimal | . (punto) | , (coma) |
| Separador miles | , (coma) | . (punto) |
| Formato fecha | DD/MM/YYYY | DD/MM/YYYY |
| Formato hora | HH:mm 24h | hh:mm a 12h (preferencia local) |
| Plural | regular | regular |
| Nombre del impuesto | IGV | IVA |
| Documento personas | DNI | CI / Cédula |
| Documento empresas | RUC | RIF |
| Comprobante venta a persona | Boleta | Factura |
| Comprobante venta a empresa | Factura | Factura |

### Rutas

Las URLs NO se traducen — siempre `/sales`, `/inventory`, `/receipts/invoices`. Razón: simplifica SEO, soporte cross-tenant, deep links. Los labels que el usuario ve sí se traducen.

### URLs SEO públicas (landing/marketing)

Fuera del scope de este ADR. Si tenemos landing pública multi-país, vivirá en un repo aparte o `app/(marketing)/...` con segmentos `/{locale}/...`.

## Consequences

### Positivas

- Agregar país = agregar carpeta `es-XX/` + filas en catálogo de países = bajo costo.
- Strings centralizadas facilitan revisión legal por contador del cliente.
- Tests pueden verificar que cada locale tiene todas las keys (CI step).

### Negativas

- Disciplina del equipo: no se permiten strings inline en componentes. Lint rule + revisión PR.
- Sync entre frontend y backend para mensajes de error (algunos se muestran tal cual). Patrón: backend devuelve `errorCode`, frontend lo resuelve a string. Backend SOLO traduce cuando es necesario (ej. emails).

### Riesgos abiertos

- **Diferencias regulatorias adicionales** que aparecen al lanzar VE pueden requerir más que strings (campos extra, validaciones). Cada uno se evalúa caso a caso.

## Alternatives considered

### A. Strings hardcoded (status quo)

- **Contras**: agregar VE = refactor masivo. Descartado.

### B. Traducir UI también a inglés/portugués

- **Pros**: futuro Brasil, mercados angloparlantes.
- **Contras**: alcance actual es LATAM hispanohablante. No agreguemos peso. Estructura es abierta.

### C. i18next vs react-intl vs next-intl

- Las 3 son válidas. Decisión la toma Frontend Dev al implementar. ADR solo fija la estructura de archivos y la regla de que NO hay strings inline.

## Implementation plan

1. Crear `frontend/lib/i18n/` con stub y locale loader (Frontend Dev, SIS-XX).
2. Migrar strings actuales del dashboard, sidebar, auth (Frontend Dev).
3. Catálogo `common/i18n/errors.ts` y exception filter que resuelve por locale (Backend Dev).
4. Helpers `format/money.ts`, `format/date.ts` parametrizados (Frontend Dev).
5. Lint rule contra string literals en JSX (ESLint plugin `react/jsx-no-literals` configurado para excluir solo etiquetas neutrales).

## References

- ICU MessageFormat: https://unicode-org.github.io/icu/userguide/format_parse/messages/
- Next-intl: https://next-intl-docs.vercel.app/
- [[002-multi-country-strategy]]
