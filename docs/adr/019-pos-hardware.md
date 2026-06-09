# ADR-019: Hardware POS — escáner, impresora térmica y gaveta vía Web APIs

- **Status**: Accepted
- **Date**: 2026-05-21
- **Author**: Architect (Claude Opus 4.7, sesión directa)
- **Issue**: SIS-59

## Context

Un POS moderno necesita interactuar con hardware físico desde el navegador:

- **Escáner de código de barras** (Honeywell, Zebra, DataLogic, Symbol).
- **Impresora térmica** ESC/POS 58mm o 80mm (Epson, Xprinter, Bixolon).
- **Gaveta de dinero** (cash drawer) — se abre con pulso eléctrico vía la impresora (RJ11) o serial.
- **Balanza** (caso mayorista al peso) — fase 2.

Históricamente esto requería instalar drivers + apps de escritorio. **Las Web APIs modernas (WebHID, WebUSB, WebSerial, Web Bluetooth)** permiten hacerlo desde el navegador sin instalación, pero con limitaciones de compatibilidad y permisos. [[010-frontend-architecture]] §POS keyboard-first menciona el escáner pero no formaliza la decisión de hardware.

Restricciones:

- **Solo Chrome y Edge desktop** soportan WebHID / WebUSB / WebSerial estables ([Chrome Status — Barcode Detection API](https://chromestatus.com/feature/4757990523535360), [MDN — Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)). Firefox y Safari NO.
- **HTTPS obligatorio** para todas las Web APIs de hardware.
- **Permiso explícito del usuario** por cada device la primera vez.
- **Gesture user-triggered**: muchos APIs (`requestDevice`) requieren click reciente para evitar abuso.

El POS objetivo corre en Chromebook / Windows + Chrome — coincide con la restricción.

## Decision

### 1. Estrategia de capas — fallback siempre disponible

| Capa | Cuándo | Tecnología | Browser |
|---|---|---|---|
| **A — Óptima** | Cuando el hardware lo soporta | WebHID (escáner) + WebUSB/Network (impresora) | Chrome/Edge desktop |
| **B — Fallback** | Browser sin Web APIs | Keyboard emulation (escáner) + Print Service local (impresora) | Cualquier browser |
| **C — Manual** | Sin hardware | Input manual + comprobante PDF / email | Cualquier browser |

El POS detecta capacidad y elige automáticamente. Configurable por tenant en `tenant.settings.hardwareMode = 'auto' | 'web-apis' | 'keyboard' | 'manual'`.

### 2. Escáner — WebHID preferido, keyboard fallback, cámara terciaria

**Tier 1 — WebHID** (Chrome/Edge ≥89):

```ts
import { WebHIDBarcodeScanner } from '@point-of-sale/webhid-barcode-scanner';

const scanner = new WebHIDBarcodeScanner();
await scanner.requestDevice();   // user gesture, modal del browser
scanner.on('barcode', (code) => cartStore.addBySku(code));
```

Librería: [`@point-of-sale/webhid-barcode-scanner`](https://www.npmjs.com/package/@point-of-sale/webhid-barcode-scanner) ([GitHub NielsLeenheer/WebHidBarcodeScanner](https://github.com/NielsLeenheer/WebHidBarcodeScanner)). Soporta Honeywell, Zebra, DataLogic out of the box. Usado en producción por [Dutchie POS](https://support.dutchie.com/hc/en-us/articles/31526876100371-Set-up-your-Dutchie-Register-hardware-with-WebUSB).

Ventajas vs keyboard emulation:
- Código entregado en un solo evento, no carácter por carácter.
- No depende de foco — funciona aunque el cursor esté en otro input.
- Sin caracteres perdidos por timing del navegador.
- Detección de tipo de barcode (EAN-13 vs QR vs Code-128).

**Tier 2 — Keyboard emulation** (fallback):

El escáner USB en modo HID-Keyboard escribe el código al input que tiene foco + Enter. Funciona en cualquier browser. El POS mantiene foco en `PosSearchInput` siempre (per [[017]] §4).

Detección: si en 300ms entran >5 caracteres seguidos terminados en Enter → asumir escáner, no teclado humano. Hook `useBarcodeDetector()` distingue.

**Tier 3 — Cámara con polyfill** (móvil / tablet sin escáner):

```ts
import { BarcodeDetector } from 'zxing-wasm';   // ponyfill de BarcodeDetector API

if (!('BarcodeDetector' in window)) {
  globalThis.BarcodeDetector = BarcodeDetector;
}
const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code'] });
// loop captureFrame del <video> → detector.detect(frame)
```

`BarcodeDetector` API nativa funciona en **Android Chrome + Chrome macOS** ([Scanbot — Barcode Detection API tutorial](https://scanbot.io/techblog/barcode-detection-api-tutorial/)). Fallback con [`zxing-wasm`](https://www.npmjs.com/package/zxing-wasm) (ZXing-C++ vía WebAssembly, mantenido). `zxing-js/library` ([GitHub](https://github.com/zxing-js/library)) está en maintenance mode — preferir `zxing-wasm`.

### 3. Impresora térmica ESC/POS — Web Print Service del backend

**Decisión clave**: NO imprimimos desde el navegador. La impresión va por el **backend** a la impresora de red TCP port 9100 (estándar industria) o por **Print Service local** que el tenant instala una vez.

Razones:
- WebUSB para impresora requiere permiso por device cada sesión — UX rota para cajero.
- Network TCP 9100 es 100% confiable, sin permisos browser.
- Print Service local cubre impresoras USB sin networking.

Arquitectura:

```
Cajero (browser) → POST /api/v1/print/receipt { receiptId } → Backend NestJS
                                                              ↓
                                                       Resuelve printer del tenant.location
                                                              ↓
                                              Genera ESC/POS bytes con node-thermal-printer
                                                              ↓
                                          Envía a TCP 192.168.1.50:9100 (printer de red)
                                              o a Print Service local 127.0.0.1:9101
```

Librería backend: [`node-thermal-printer`](https://sourceforge.net/projects/node-thermal-printer.mirror/) — soporta Epson, Star, Tanca, Daruma. Templates declarativos:

```ts
const printer = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: 'tcp://192.168.1.50:9100' });
printer.alignCenter();
printer.println(receipt.tenantName);
printer.bold(true); printer.println(receipt.serie + '-' + receipt.number); printer.bold(false);
printer.tableCustom([...]); // items
printer.cut();
await printer.execute();
```

Templates por tipo de comprobante en `backend/src/modules/printing/templates/{boleta,factura,ticket-interno,nota-credito,reporte-z}.template.ts`.

**Print Service local** (para tenant que usa impresora USB sin networking):
- Pequeño binario Node.js que el tenant instala una vez (`pnpm install -g @sistemaventarapida/print-agent`).
- Expone `POST http://127.0.0.1:9101/print` que recibe ESC/POS bytes y los pasa a la impresora USB local.
- El backend lo descubre vía mDNS o config manual del tenant.
- Solo Windows + Mac + Linux desktop (Chromebooks usan TCP 9100).

### 4. Gaveta de dinero — kick vía printer ESC/POS

Estándar industria: la gaveta se conecta a la impresora vía RJ11. Imprimir un comando ESC/POS `kick` (0x1B 0x70 0x00 0x32 0xFA) abre el cajón antes de imprimir el ticket.

```ts
printer.openCashDrawer();  // wraps el comando estándar
printer.printReceipt();
```

Configuración por tenant: `tenant.settings.openCashDrawerOnSale = true` (default true para cash, false para card-only).

Sin impresora ESC/POS → gaveta no se abre electrónicamente. Cajero la abre manual.

### 5. Balanza — fase 2 (WebSerial)

Caso mayorista que vende granel (queso, granos): la balanza envía peso continuo por puerto serial.

- Librería: `web-serial` API nativa.
- Hook `useWeightStream()` lee continuo, muestra en input cuando el cajero confirma "tomar peso".
- Marcas: Toledo, Mettler, OHaus — todas serial RS-232.

**Fuera de scope MVP.** Entra cuando un tenant mayorista lo pida.

### 6. Detección y selección de hardware — wizard primera vez

Primera vez que un cajero entra al POS desde una PC nueva:

1. Modal "Configurar hardware de esta caja" (skippable).
2. Detecta browser → muestra qué APIs están disponibles.
3. Botón "Conectar escáner" → user gesture `navigator.hid.requestDevice()`.
4. Botón "Configurar impresora" → input IP + puerto + tipo (default 9100, Epson genérico) o auto-discover mDNS.
5. Test print + test scan al final.
6. Config guardado en `localStorage` por device + en `tenant_locations.hardwareConfig` para audit.

`useHardware()` hook expone `{ scanner, printer, cashDrawer, balance, status }` para componentes del POS.

### 7. Compatibilidad browser — matriz declarada

Documentada en `frontend/CLAUDE.md` y mostrada al cajero si está en browser no recomendado:

| Browser | WebHID escáner | TCP printer (vía backend) | BarcodeDetector | Recomendado POS |
|---|---|---|---|---|
| Chrome desktop ≥89 | ✅ | ✅ | macOS sí, Win no | ✅ **Sí** |
| Edge desktop ≥89 | ✅ | ✅ | macOS sí, Win no | ✅ **Sí** |
| Chrome Android | ❌ | ✅ | ✅ | ⚠️ Solo si cámara |
| Safari (todas) | ❌ | ✅ | ❌ | ❌ Fallback solo |
| Firefox | ❌ | ✅ | ❌ | ❌ Fallback solo |

Mensaje en login si browser no recomendado: "Para mejor experiencia usa Chrome o Edge en escritorio".

### 8. Transaccionalidad — impresión es side-effect, NO bloquea venta

La venta se considera completada cuando la transacción de BD commitea ([[005-sale-concurrency]] + [[017-fast-checkout-unified]] §9). La impresión es un side-effect posterior:

- POST `/print/receipt` se hace **después** del commit de venta, en una llamada separada.
- Si la impresión falla → venta sigue válida, comprobante existe en BD, cajero puede reimprimir con `F11` o enviar por email.
- Tabla `print_jobs { id, receipt_id, target, status: 'pending'|'sent'|'failed', attempted_at, error }` para retry y auditoría.
- Reimprimir requiere permiso `print:reissue` ([[006-auth-and-rbac]]) — auditado.

### 9. Browser sandboxing y seguridad

- **HTTPS obligatorio** (Web APIs requieren contexto seguro).
- **Permission lifetime**: WebHID permisos persisten por sesión + origin. Cuando cambia el origin (deploy nuevo en subdomain), re-solicitar. Documentar en runbook.
- **No exponer hardware a `iframe` ni a contenido cross-origin** (default browser).
- **Print Service local**: bind solo a `127.0.0.1`, nunca `0.0.0.0`. Token compartido en config.

## Consequences

- ✅ Hardware moderno desde browser sin instalar drivers (caso WebHID + Network printer).
- ✅ Fallback graceful para browser/hardware antiguo (keyboard emulation + Print Service local).
- ✅ Impresión desde backend = templates centralizados, fácil customizar por tenant.
- ✅ Gaveta se abre automático al cobrar efectivo — UX como POS clásico.
- ✅ Tier de cámara cubre tablet/móvil sin escáner físico (caso ambulante / restaurante).
- ⚠️ Restringe al cajero a Chrome/Edge desktop para experiencia óptima. Documentar en sales materials.
- ⚠️ Print Service local agrega un binario más a mantener para tenants con impresora USB pura.
- 🔓 Riesgo abierto: Firefox y Safari no implementarán WebHID a corto plazo ([Mozilla — no plan to implement](https://mozilla.github.io/standards-positions/)). Aceptable — POS no es uso de Firefox/Safari.
- 🔓 Riesgo abierto: Print Service local requiere update cuando cambian credenciales del tenant. Mitigación: auto-update via electron-updater o similar.

## Alternatives considered

| Alternativa | Por qué no |
|---|---|
| A. App de escritorio (Electron) para todo | Mata el modelo SaaS web. Mantener instaladores por OS es caro. |
| B. Solo keyboard emulation para escáner | Pierde reliability + foco. WebHID es estricticamente mejor cuando disponible. |
| C. WebUSB para impresora directo desde browser | Permission UX rota (pide permiso cada nuevo origin/sesión). TCP 9100 vía backend gana. |
| D. Imprimir PDF y que el sistema operativo lo mande a la impresora | Latencia adicional + diálogo de impresión. ESC/POS directo es <1s. |
| E. Soporte Bluetooth (Web Bluetooth) para gaveta | Hardware específico, mercado pequeño. RJ11 vía printer es estándar. |
| F. Drivers nativos via NPAPI / Java Applet | Tecnologías muertas hace 10 años. No. |

## Implementation plan

1. Frontend `frontend/lib/hardware/` con `useScanner()`, `useHardwareConfig()` (Frontend Dev, SIS-XX).
2. Adapter `@point-of-sale/webhid-barcode-scanner` integrado (Frontend Dev).
3. Polyfill `zxing-wasm` para cámara (Frontend Dev).
4. Wizard "Configurar hardware" primera vez (Frontend Dev).
5. Backend `modules/printing/` con `node-thermal-printer` + templates ESC/POS (Backend Dev, SIS-XX).
6. Endpoint `POST /api/v1/print/receipt` + cola `print_jobs` (Backend Dev).
7. Print Service local (binary Node distribuible — opcional, fase 2 si demanda) (Backend Dev).
8. Tests: WebHID con scanner mock, ESC/POS golden bytes contra Epson sim (QA).
9. Documentar browser matrix en `frontend/CLAUDE.md` y en marketing site.

## References

- [[005-sale-concurrency]] · [[006-auth-and-rbac]] · [[010-frontend-architecture]] · [[017-fast-checkout-unified]]
- MDN — Barcode Detection API: https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- MDN — BarcodeDetector: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- Chrome Status — Barcode Detection API: https://chromestatus.com/feature/4757990523535360
- CanIUse — BarcodeDetector: https://caniuse.com/mdn-api_barcodedetector
- Scanbot — Barcode Detection API tutorial: https://scanbot.io/techblog/barcode-detection-api-tutorial/
- Dynamsoft — Web QR Scanner usando Barcode Detection API: https://www.dynamsoft.com/codepool/web-qr-code-scanner-barcode-detection-api.html
- GitHub — zxing-js/library (maintenance mode): https://github.com/zxing-js/library
- npm — zxing-wasm (ponyfill BarcodeDetector): https://www.npmjs.com/package/zxing-wasm
- GitHub — NielsLeenheer/WebHidBarcodeScanner: https://github.com/NielsLeenheer/WebHidBarcodeScanner
- npm — @point-of-sale/webhid-barcode-scanner: https://www.npmjs.com/package/@point-of-sale/webhid-barcode-scanner
- Dutchie — Setup hardware con WebUSB: https://support.dutchie.com/hc/en-us/articles/31526876100371-Set-up-your-Dutchie-Register-hardware-with-WebUSB
- Jonathan Lau — WebHID y WebUSB guide: https://blog.jonathanlau.io/posts/understanding-webhid-and-webusb-configur/
- Medium Till — Receipt printing ESC/POS JavaScript: https://medium.com/till-engineering/receipt-printing-with-esc-pos-a-javascript-cross-platform-library-7110d7f7a1db
- SourceForge — node-thermal-printer: https://sourceforge.net/projects/node-thermal-printer.mirror/
- GitHub — node-escpos/driver: https://github.com/node-escpos/driver
- iflair — How to Print Order Receipts Node.js ESC/POS: https://www.iflair.com/how-to-print-order-receipts-from-a-kiosk-machine-using-node-js-and-esc-pos/
