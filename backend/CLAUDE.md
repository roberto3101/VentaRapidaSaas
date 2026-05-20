# CLAUDE.md — Backend (NestJS)

> Contexto específico del backend. Cualquier agente que tocque backend lee primero el CLAUDE.md raíz, después este.

## Qué es esto

API REST del SistemaVentaRapida construida con **NestJS 11**. Sirve a frontend Next.js + cualquier integración futura (POS hardware, ERPs externos).

## Stack

- NestJS 11 (modules + controllers + services + DTOs)
- Prisma 6 (ORM contra PostgreSQL)
- JWT auth + class-validator
- Pino logger
- Jest para unit + integration tests

## Convenciones (no negociables)

### Estructura por módulo

```
modules/<domain>/
├── CLAUDE.md              ← contexto del módulo (qué dominio cubre, decisiones locales)
├── <domain>.controller.ts ← rutas HTTP, validación, mapping
├── <domain>.service.ts    ← lógica de negocio, casos de uso
├── <domain>.repository.ts ← wrapper Prisma con multi-tenant guard
├── dto/
│   ├── create-<entity>.dto.ts
│   ├── update-<entity>.dto.ts
│   └── <entity>-response.dto.ts
├── entities/
│   └── <entity>.entity.ts
└── <domain>.module.ts
```

### Multi-tenancy

- TODA query lleva `where: { tenantId }`
- Existe middleware Prisma global que valida que no se omita (si se omite → error en runtime)
- `tenantId` viene de JWT en cada request (decorator `@CurrentTenant()`)

### Validación

- DTOs usan `class-validator` decorators: `@IsString()`, `@IsNumber()`, `@IsDecimal()`, `@IsUUID()`, etc.
- `ValidationPipe` global con `whitelist: true, forbidNonWhitelisted: true, transform: true`
- Custom validators para RUC, RIF, EAN-13 en `common/validators/`

### Errores

- Throw `BadRequestException`, `NotFoundException`, `ForbiddenException`, `UnauthorizedException`, `ConflictException` de `@nestjs/common`
- Custom exceptions extienden los de Nest, no retornar objetos `{ error: ... }` desde services
- Filtros globales mapean a JSON consistente

### Money

- `Decimal` de `@prisma/client/runtime/library` para todo lo monetario
- Helpers en `common/money/` para suma, resta, conversión PEN ↔ VES con tipo de cambio diario
- NUNCA Float ni Number JS para precios o totales

### Transacciones

- Operaciones con >1 tabla: `prisma.$transaction(async (tx) => { ... })`
- Locks explícitos en operaciones críticas (último item en stock): `SELECT ... FOR UPDATE`
- Aislamiento `Serializable` para venta + pago + comprobante

### SUNAT / SENIAT

- Lógica encapsulada en `modules/sunat/` y `modules/seniat/`
- Cada uno expone un `IFiscalEmitter` interface (Hexagonal)
- Backend Dev NO toca el código de firma digital — eso es responsabilidad del Architect + Roberto (es código propio del cliente)

## Comandos comunes

```bash
pnpm install                 # instalar deps
pnpm run start:dev           # dev server con watch
pnpm run build               # build producción
pnpm run test                # unit tests
pnpm run test:e2e            # integration tests
pnpm run lint                # eslint
npx prisma migrate dev       # nueva migración
npx prisma generate          # regenerar cliente Prisma
npx prisma studio            # GUI de la BD
```

## Variables de entorno

Ver `.env.example`. Mínimo requerido:
- `DATABASE_URL` postgres connection string
- `JWT_SECRET` random 32+ chars
- `NODE_ENV` development | production
- (cuando aplique) certificados SUNAT/SENIAT vía secret manager

## Roles que tocan este backend

- **Backend Developer**: implementa módulos, endpoints, services
- **DBA**: revisa cada query, schema, migración
- **QA**: tests unit + integration en este mismo proyecto
- **Security**: pentest endpoints
- **Architect**: ADRs que afecten estructura

## Cuando agregues un nuevo módulo

1. Crea `modules/<domain>/CLAUDE.md` explicando: qué dominio cubre, entidades principales, reglas locales, dependencias con otros módulos
2. Sigue la estructura estándar de arriba
3. Tests al lado de cada service/controller
4. Si el módulo afecta multi-tenancy o multi-país: ADR en `docs/adr/`
