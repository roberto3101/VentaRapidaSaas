# ADR-010: Arquitectura frontend — Next 16 App Router + Zustand + POS keyboard-first

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-50

## Context

`frontend/` arrancó con Next 16.1.6 + React 19 + Tailwind 4 + Zustand 5 + lucide-react, sin opinión documentada sobre:

- Cómo se gestiona estado servidor vs cliente (no hay React Query / SWR).
- Cómo se maneja el carro del POS, métodos de pago, escáner, vuelto — hoy hay archivos sueltos sin patrón (`frontend/stores/carrito.store.ts`, `frontend/componentes/pos/{dialog-pago,escaner-input,linea-carrito}.tsx`) creados ad hoc.
- Estrategia offline: una bodega con internet inestable no puede dejar de vender por 30 segundos de caída.
- UX del POS: ¿mouse-first o keyboard-first? El escáner físico USB típicamente emula teclado por defecto, pero hay APIs web modernas (WebHID en HID mode) que entregan el código en un solo evento sin "teclear" carácter por carácter, evitando errores de timing — ver decisión §3 y §POS hardware abajo. El cajero tiene una mano ocupada empacando.
- i18n implementación concreta ([[007-i18n-strategy]] decidió la política, no la librería).
- Auth flow en el cliente (JWT en cookie httpOnly vs localStorage vs Next middleware).
- Forms / validación cliente (espejo del `class-validator` del backend).

CLAUDE.md raíz §95-115 fija reglas duras: rutas en `src/lib/routes.ts` tipadas, URL en inglés, labels traducidas, modular monolith. Esta ADR concreta lo demás.

## Decision

### 1. Estado: tres capas con responsabilidades claras

| Capa | Herramienta | Qué guarda |
|---|---|---|
| **Server state** | TanStack Query v5 | Listados, detalles, lo que viene del backend. Cache + revalidación + optimistic updates. |
| **Client state global** | Zustand 5 (con `persist` selectivo) | Carro POS, turno activo del cajero, preferencias UI, tema. |
| **Form state local** | react-hook-form + zod | Solo dentro del form. Nunca se "eleva" a Zustand. |

Reglas:

- **Cero `useState` global**: si el dato lo necesita más de un componente lejano → Zustand.
- **Cero fetches en componentes**: todo fetch pasa por un hook `useXxxQuery` / `useXxxMutation` en `servicios/<contexto>.queries.ts`. Esto facilita mocking en tests y aplica cache uniforme.
- **Persist solo lo que sobrevive a refresh**: carro POS sí (cajero no quiere perder 30 items), filtros de listado no.
- **Reset on logout**: hook `useResetStores()` que limpia todo Zustand persistido al cerrar sesión (el carro de un cajero no es del siguiente).

### 2. POS — keyboard-first y full-screen

El POS es la pantalla más crítica. Decisiones de UX:

- **Layout**: split 70/30. Izquierda = búsqueda + lista de líneas del carro. Derecha = totales + atajos + métodos de pago.
- **Foco siempre en el input de búsqueda/escáner** (`autoFocus` + re-focus al `blur`). Fallback universal: el escáner USB en modo keyboard-emulation escribe rápido y termina con Enter — el input lo recibe transparente. **Modo preferido cuando el navegador lo permite**: WebHID directo al escáner Honeywell/Zebra/DataLogic vía librería `@point-of-sale/webhid-barcode-scanner` ([npm](https://www.npmjs.com/package/@point-of-sale/webhid-barcode-scanner), [GitHub NielsLeenheer/WebHidBarcodeScanner](https://github.com/NielsLeenheer/WebHidBarcodeScanner)) — entrega el código en un solo evento, sin perder el foco, sin caracteres perdidos. Solo Chrome y Edge desktop ([MDN BarcodeDetector API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)). **Cámara/QR como tercera opción**: `BarcodeDetector` nativo en Android/Chrome macOS, polyfill `zxing-wasm` ([npm](https://www.npmjs.com/package/zxing-wasm)) en el resto. Detalle de hardware en **ADR-019**.
- **Atajos teclado obligatorios** (todos visibles en barra inferior):
  - `F2` = abrir cliente (buscar/crear)
  - `F3` = aplicar descuento línea
  - `F4` = método de pago
  - `F8` = cobrar
  - `F9` = anular última línea
  - `ESC` = cerrar diálogo activo
- **Sin scroll en pantalla principal**: las líneas del carro hacen scroll dentro de su columna, no la página entera.
- **Vuelto destacado**: cuando el monto pagado > total, el vuelto aparece en font 4xl. Es lo único que el cajero mira al cobrar efectivo.
- **Modo full-screen** opcional con `Wake Lock API` (impide que la pantalla se duerma).
- **Sin animaciones costosas** en el flujo de venta: `transition: none` en botones cuando `data-pos="true"`. La velocidad percibida importa más que la pulcritud.

### 3. Offline-first — degradación graceful (MVP), no full offline

Decisión: **MVP es online-first con degradación visible**, no offline-first real.

- **Detección**: `useOnlineStatus()` hook que combina `navigator.onLine` + ping a `/health/live` cada 30s.
- **Online**: comportamiento normal.
- **Offline detectado**:
  - Banner amarillo persistente "Sin conexión — solo lectura. No puedes cobrar."
  - Búsqueda de productos usa **cache de TanStack Query** (sigue funcionando para los últimos buscados).
  - Botón "Cobrar" deshabilitado con tooltip "Espera conexión".
  - El carro NO se pierde (Zustand persist en localStorage).
- **Vuelve la conexión**: banner verde 3s "Conectado", botón se rehabilita.

Razón: full offline-first (queue de ventas, sync conflict resolution, secuencias correlativas reservadas localmente) tiene costo de diseño altísimo y riesgo real de doble venta / boletas duplicadas. Para MVP, una caída de 30s significa esperar 30s — aceptable para bodega. Full offline entra como **ADR-017** cuando un cliente real lo exija con dolor cuantificado.

### 4. Rutas y navegación

- **Archivo único** `src/lib/routes.ts` con constantes tipadas:
  ```ts
  export const routes = {
    pos: '/pos',
    sales: { list: '/sales', detail: (id: string) => `/sales/${id}` },
    inventory: { list: '/inventory', stock: (productId: string) => `/inventory/${productId}/stock` },
    // ...
  } as const;
  ```
- **NUNCA** hardcoded strings de URL en componentes/Links/`router.push()`.
- **URLs siempre en inglés** (`/sales`, `/inventory`, `/cash-shifts`). Labels traducidas via i18n.
- **Layouts**: `(auth)` para login/signup sin sidebar; `(dashboard)` para todo lo logueado con sidebar; `(pos)` layout especial sin sidebar, full-screen.

### 5. i18n — cierre técnico de [[007-i18n-strategy]]

ADR-007 delegó la elección de librería al Frontend Dev. **Esta ADR la cierra: `next-intl`** (App Router-native, server-component friendly, plurales ICU, `Intl.NumberFormat` integrado).

Respetamos la estructura de archivos ya fijada en ADR-007:

```
frontend/lib/i18n/
├── index.ts                          ← provider + hook useT()
├── locales/
│   ├── es-PE/{common,pos,inventory,receipts,settings}.json
│   └── es-VE/...
└── format/{money,date,number,document}.ts
```

- **Locale por tenant**: stored en `tenant.defaultLocale`. El layout root resuelve desde el JWT (no del browser, per ADR-007).
- **Routing**: locale NO va en la URL (mantenemos `/sales`, no `/es-pe/sales`).
- **Glosario** `docs/glossary.md` es la fuente de verdad. Todo nuevo string en UI revisa glosario primero.
- **Plurales y formatos** vía `useFormatter()` de next-intl, nunca concatenación manual.

### 6. Auth en el cliente — aplicación de [[006-auth-and-rbac]]

ADR-006 ya fijó: refresh token en cookie httpOnly + access token en memoria. Esta ADR concreta el patrón Next:

- **Access token**: en Zustand store **NO persistido** (`useAuthStore.accessToken`). Si se refresca la página → llamada silenciosa a `/api/v1/auth/refresh` con la cookie.
- **Refresh token**: cookie httpOnly + secure + SameSite=Strict. Inmune a XSS. Rotación en cada uso (ADR-006).
- **Middleware Next** (`middleware.ts` en root) intercepta `(dashboard)` y `(pos)`: si no hay cookie válida → redirect a `/login?from=...`.
- **Interceptor TanStack**: cuando un fetch responde `401` y hay cookie de refresh → intenta refresh + retry una vez. Si refresh falla → `useResetStores()` + redirect a login.
- **CSRF**: si frontend y backend están en hosts distintos → double-submit cookie token en endpoints mutables.
- **Logout**: `POST /api/v1/auth/logout` revoca refresh server-side, frontend limpia memoria + `useResetStores()`.

### 7. Forms — react-hook-form + zod

- **Esquemas zod en `frontend/esquemas/<contexto>.schema.ts`**. Espejo de los DTOs backend pero NO los importa (los DTOs backend usan `class-validator`, lenguaje distinto).
- **Inferencia de tipo**: `type CrearProductoInput = z.infer<typeof crearProductoSchema>`.
- **Errores en español** (mensajes de zod customizados): `z.string().min(1, 'Requerido')`.
- **Submit flow**: `handleSubmit(data => mutation.mutate(data))`. El mutation reporta error con `toast.error()`.
- **Backend errors mapping**: backend devuelve `{ field, message }[]` → form muestra en `errors[field]`.

### 8. Componentes — primitives + features

Estructura `frontend/componentes/`:

```
componentes/
├── ui/                    ← primitives sin lógica (button, input, dialog, table). Compose-friendly.
├── layout/                ← header, sidebar, page-shell
├── pos/                   ← componentes específicos del POS
├── inventario/            ← componentes específicos de inventario
└── compartidos/           ← entre features (data-table, money-display, date-range-picker)
```

Reglas:

- `ui/` NO importa de `pos/`, `inventario/`, etc. Solo dependencias estándar (lucide, tailwind-merge).
- `pos/`, `inventario/`, etc. PUEDEN importar de `ui/` y `compartidos/`.
- Cross-feature import (ej. `pos/` importa de `inventario/`) → mover a `compartidos/`.

### 9. Performance budgets

- **LCP ≤ 2.5s** en pantalla POS (red 4G, dispositivo medio).
- **TBT ≤ 200ms** en POS.
- **Bundle inicial ≤ 200KB gzipped** para la ruta `/pos`. Code-split agresivo: cada feature carga lo suyo.
- **`next/image`** obligatorio para imágenes de productos.
- **`React.memo` SOLO** en componentes que aparecen en listas >50 ítems con props estables (líneas de carro NO, lista de productos en búsqueda SÍ).

## Consequences

- ✅ POS rápido y operable con solo teclado — coincide con la realidad del cajero.
- ✅ Estado servidor consistente vía TanStack Query → sin "stale data" entre pantallas.
- ✅ Carro persistido → cajero no pierde trabajo si refresca/cierra accidental.
- ✅ Offline graceful evita el peor caso (vender sin secuencia válida → duplicar comprobantes).
- ⚠️ TanStack Query agrega ~13KB gzipped — aceptable.
- ⚠️ Zustand persist en localStorage no es seguro si el dispositivo es compartido. Mitigación: `useResetStores()` en logout, idealmente sessionStorage para el carro si el cajero rota PC en una sede (config por tenant en fase 2).
- 🔓 Riesgo abierto: full offline-first cuando llegue un cliente con internet rural inestable. ADR-017 pendiente.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. SWR en vez de TanStack Query | TanStack tiene mejor DX para mutations + optimistic updates + DevTools. La diferencia de peso es marginal. |
| B. Redux Toolkit en vez de Zustand | Zustand ya está. Redux es mucho boilerplate para el tamaño del estado cliente que tenemos. |
| C. Offline-first desde MVP con sync | 3-5 semanas de diseño + riesgo real de doble emisión. Posponer a ADR-017. |
| D. Locale en la URL (`/es-pe/sales`) | Empeora el ya-resuelto-por-tenant defaultLocale. URLs más largas sin beneficio SEO (es SaaS, no público). |
| E. Mouse-first POS (estilo Shopify) | Cajero de bodega en Perú vende con escáner + teclado numérico. Mouse-first lo hace lento. |
| F. JWT en localStorage | XSS exfiltrable trivialmente. Cookie httpOnly es el estándar 2026. |

## Implementation plan

1. Instalar `@tanstack/react-query`, `react-hook-form`, `zod`, `next-intl` (Frontend Dev).
2. Crear `frontend/lib/routes.ts` y migrar todos los `Link href="..."` hardcoded.
3. Crear `frontend/lib/query-client.ts` (config TanStack) y `<Providers>` en `app/layout.tsx`.
4. Reescribir el POS WIP actual respetando este ADR: layout 70/30, atajos teclado, foco escáner, vuelto destacado.
5. `useOnlineStatus()` + banner offline + bloqueo de cobro.
6. `useResetStores()` + integrarlo en logout.
7. arch-lint v1 (frontend): regla que `ui/` no importa de features.
8. Test E2E (Playwright) flujo POS feliz: escanear 3 productos → cobrar efectivo → ver vuelto.

## References

- [[007-i18n-strategy]] · [[008-clean-architecture-layers]] · [[009-cash-shifts]]
- Next 16 App Router: https://nextjs.org/docs/app
- TanStack Query v5: https://tanstack.com/query/v5
- next-intl: https://next-intl.dev
- Wake Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
