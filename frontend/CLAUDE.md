# CLAUDE.md — Frontend (Next.js)

> Contexto específico del frontend. Cualquier agente que tocque frontend lee primero el CLAUDE.md raíz, después este.

## Qué es esto

Frontend del SistemaVentaRapida. Construido con **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind 4** + **Zustand 5** + **lucide-react**.

## Audiencia primaria

- Cajeros de bodega/minimarket (uso 8+ horas al día, debe ser RÁPIDO y SIMPLE)
- Admin/dueño (configuración, reportes, gestión)
- Acceso desde **mobile + desktop + tablet**. Mobile-first.

## Convenciones (no negociables)

### Estructura

```
src/
├── app/                  ← App Router routes
│   ├── (auth)/           ← grupo: login, register, recover
│   ├── (dashboard)/      ← grupo protegido
│   │   ├── pos/          ← POS de venta (la página estrella)
│   │   ├── inventory/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── layout.tsx    ← shell del dashboard
│   ├── layout.tsx        ← root layout
│   └── page.tsx          ← landing
├── components/
│   ├── ui/               ← primitivos reusables (Button, Input, Modal, Card)
│   ├── pos/              ← componentes POS (ProductScanner, CartLine, PaymentDialog)
│   ├── reports/
│   └── shared/
├── stores/               ← Zustand stores
│   ├── auth.ts
│   ├── cart.ts           ← carrito de venta en curso
│   ├── products.ts
│   └── shift.ts          ← turno de caja activo
├── lib/
│   ├── api.ts            ← cliente API tipado
│   ├── i18n/             ← strings es-PE, es-VE
│   ├── format/           ← money, dates, numbers por país
│   └── validators/       ← zod schemas (mirror del backend)
└── types/                ← shared types
```

### Reglas

- **Server Components por default**. `'use client'` solo cuando: eventos, useState, browser APIs
- **API calls solo en `lib/api.ts`**, nunca fetch suelto en componentes
- **Estado global con Zustand**, NO Context API para datos de app
- **Forms con `react-hook-form` + Zod**. Las schemas Zod mirror el DTO del backend
- **Icons solo `lucide-react`**
- **Tailwind utility-first**. Variants con `tailwind-merge` + `clsx` en helper `cn()`
- **i18n**: strings en `lib/i18n/`, nunca hardcoded en componentes. Soportar es-PE y es-VE (diferencias: "boleta" vs "factura", PEN vs VES, etc.)

### UX rules para POS (página crítica)

- **Escaneo rápido**: cursor SIEMPRE en input de código de barras. Tras enter → agrega al carrito + resetea cursor
- **Atajos de teclado**: F1 ayuda, F2 cliente, F3 descuento, F4 anular línea, F12 cobrar
- **Vuelto auto-calculado** en tiempo real al ingresar monto pagado
- **Loading states**: nunca pantalla blanca. Skeleton o spinner sutil
- **Error states**: mensaje claro + acción (reintentar / contactar admin)
- **Empty states**: todas las listas vacías tienen mensaje + CTA

### Performance

- Lazy load de rutas pesadas (`reports/`, `settings/`)
- Imágenes con `next/image`
- Virtualización en listas >100 items (`@tanstack/react-virtual`)
- Lighthouse target: Performance 90+, Accessibility 100, Best Practices 100

### Validación de inputs (compartido con backend, frontend valida primero)

- Números: input `type="number"` + Zod `.number().positive()`. No deja ingresar letras
- Fechas: `react-day-picker` o native date input + Zod `.date()`. No formatos free-text
- Códigos de barras: solo dígitos, checksum EAN-13 client-side
- RUC/RIF: validación de formato + checksum antes de mandar al backend
- Money inputs: máscara con `react-number-format`

## Comandos comunes

```bash
pnpm install
pnpm run dev          # dev server en :3001
pnpm run build        # build producción
pnpm run start        # producción
pnpm run lint
```

## Variables de entorno

- `NEXT_PUBLIC_API_URL` → URL del backend
- Más en `.env.local.example`

## Roles que tocan este frontend

- **Frontend Developer**: implementa UI y stores
- **QA**: tests E2E con Playwright
- **Security**: revisa XSS, CSRF, mass assignment desde cliente
- **Architect**: aprueba cambios estructurales

## Cuando agregues una nueva subcarpeta

Crea su `CLAUDE.md` explicando: qué cubre, decisiones locales (ej: "los componentes del POS no usan layout shells, son fullscreen"), dependencias.
