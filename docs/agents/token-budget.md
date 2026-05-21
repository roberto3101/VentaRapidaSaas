# Token Budget Policy — Agentes Paperclip SIS

> Política única. Léela 1 vez por wake-up. No la repitas, no la cites textualmente en el output, solo aplícala.

## 1. Routing por tarea (model selection)

| Tipo de tarea | Modelo | Por qué |
|---|---|---|
| Lint, formato, sweep regex, búsqueda exacta de símbolo | **Ollama local** (`qwen2.5-coder:7b` o `whiterabbit-neo:13b`) vía LLM Router | $0, no necesita razonar |
| Doc updates (README, CLAUDE.md, glossary), commit messages, PR descriptions | **Haiku 4** | 12× más barato que Sonnet, suficiente |
| CRUD simple (1 endpoint + DTO + test) | **Haiku 4** | Boilerplate determinista |
| Implementación feature multi-archivo, refactor local | **Sonnet 4.7** | Default |
| ADRs definitivos, refactor cross-module, deuda arquitectónica | **Sonnet 4.7** con prompt cache | Reutiliza contexto |
| Pentesting profundo, threat modeling, post-mortem incidente | **Opus 4.7** | Solo escalación explícita del humano |

**Default cuando dudes: Sonnet.** Nunca Opus sin instrucción explícita del board (Roberto).

## 2. Recorte de contexto (lo más caro es leer)

- **NO leas el CLAUDE.md raíz cada vez.** Asume que sabes el stack (NestJS 11, Prisma 6, Next 16, multi-tenant). Si dudas, lee solo la sección que necesitas.
- **Lee solo tu bounded context + `shared-kernel`.** Si tocas `ventas/`, no leas `inventario/` salvo que haya un evento entre ellos. Importa contratos vía Port, no implementaciones.
- **Glob/Grep antes que Read.** Nunca leas un archivo entero para encontrar 1 función — `Grep` con `-n` y luego `Read` con `offset/limit`.
- **No re-leas archivos que acabas de editar.** El harness te avisa si la edición falló.
- **Skills > re-descubrimiento.** Si tu skill ya describe el patrón (ej. "todo módulo nuevo va a `src/modulos/<nombre>/` con `controller.ts, service.ts, module.ts, dto/`"), no exploralo otra vez.

## 3. Atomización de issues (límite duro)

- **1 issue = 1 PR ≤ 300 LOC** (sin contar tests).
- Si tu issue requiere >300 LOC, **devuélvelo al Architect** comentando "issue demasiado grande, divídelo en N issues con dependencias `addBlockedBy`".
- Feature grande = árbol de issues atómicos con dependencias. Cada agente toma 1 nodo del árbol.
- **No mezcles refactor + feature** en el mismo PR. Refactor primero (PR aparte), feature después.

## 4. Cacheo del prompt (Anthropic prompt cache)

- Tu `AGENTS.md` + el doc actual (`token-budget.md`) viven en el prefijo cacheable del system prompt.
- **No los repitas en cada turno.** Asume que ya están en cache.
- TTL del cache: 5 min. Si vas a hacer >1 acción en una sesión, encadénalas seguidas (no esperes).

## 5. Heartbeats apagados, wake-on-demand obligatorio

- Todos los agentes están en `heartbeat.enabled: false` y `wakeOnDemand: true`. **Mantenlo así.**
- 0 tokens cuando no hay trabajo. Solo despiertan al asignárseles un issue.
- Si propones reactivar un heartbeat, justifica costo/beneficio en un ADR.

## 6. Reglas por agente

### Backend Developer / Frontend Developer / DBA
- **Default Sonnet.** No escales a Opus.
- Antes de implementar, escribe un mini-plan (≤10 líneas) en el comentario del issue. Si Architect lo rechaza, no gastas tokens en código tirado.
- Tests: 1 happy path + 1 edge (tenant cruzado o validación). No batería completa por issue.

### Architect
- **Default Sonnet.** Opus solo si Roberto comenta "@architect usa opus" o si es un ADR P0.
- ADRs en formato corto Context / Decision / Consequences / Alternatives. Sin párrafos relleno.
- Cuando partes una feature en issues, **incluye en cada uno**: archivo(s) a tocar, contrato exacto (DTO/endpoint), 1-line acceptance.

### QA Engineer
- **Default Sonnet.** Lee solo el diff del PR, no el repo entero.
- Si un test ya existe y solo necesitas ampliarlo, edítalo, no rescribas la suite.

### Security Hacker
- **Pausado por default.** Despierta solo cuando Architect o Roberto te asignen issue P0.
- Cuando despiertes: **Sonnet primero**, escala a Opus solo si encuentras vuln real que requiere PoC.

### Orchestrator
- **Default Sonnet.** Trabajo mecánico de routing.
- Cuando recibas request del humano: si cabe en 1 issue atómico, créalo y asigna. Si no, escala a Architect para partir.
- **No hagas tú la implementación.** Tu job es ruteo.

### GitHub Manager
- **Haiku.** PR descriptions, merge checks, status pings — todo es texto formulario.

### LLM Router
- **Sonnet.** Decide localmente sin llamar a APIs externas para decidir.
- Heurística: si la tarea es regex/lint/format → Ollama. Si es razonamiento → Sonnet. Resto → Haiku.

## 7. Métricas que reportas

Cada vez que cierras un issue, en el último comentario incluye:
- Tokens consumidos (si lo sabes; si no, "n/a")
- Modelo usado
- LOC del PR

Esto va a `docs/agents/cost-report.md` mensualmente (lo agrega GitHub Manager).

## 8. Stop-loss

- Si el `spentMonthlyCents` de la company > 80% del budget → **defer non-critical**, comenta en el issue por qué pausas y reasigna a `null`.
- Si tu agente individual supera su `budgetMonthlyCents` → te auto-pausas con `pauseReason: "budget_exceeded"`.

## 9. Fuera de alcance (no toques)

- Cambiar modelos vía `PATCH /agents/:id` sin pasar por ADR.
- Activar `heartbeat.enabled` sin ADR.
- Ampliar tu propio `budgetMonthlyCents`.
- Llamar a APIs LLM externas no aprobadas (solo Anthropic + Ollama local).

---

**Versión**: 1.0 · **Vigente desde**: 2026-05-21 · **Owner**: Architect · **Aprobado por**: Roberto
