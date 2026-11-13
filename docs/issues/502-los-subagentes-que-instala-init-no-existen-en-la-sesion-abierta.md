---
caso: 502
titulo: Los subagentes que instala `init` no existen en la sesión que lo corrió, y nada dice que haya que abrir otra
estado: abierto
prioridad: alta
version-detectada: 0.119.0
---

# 502 — Los subagentes que instala `init` no existen en la sesión que lo corrió, y nada dice que haya que abrir otra

**🔴 abierto** · detectado en 0.119.0 · prioridad **alta**: deja `/autobuild`, el camino principal, muerto en la primera sesión de quien instala Cauce desde el runner, que es como lo instaló la corrida a ciegas del caso 494.

## Resumen

`init --runner claude` instala `.claude/agents/cauce-clerk.md` y `cauce-scribe.md`. Claude Code registra los tipos de agente al arrancar el proceso, así que en la sesión desde la que se corrió `init` esos tipos no existen, y el primer `agent({ agentType: 'cauce-clerk' })` de `/autobuild` aborta el recorrido. Ni `init`, ni `automation install`, ni el README dicen que haya que abrir una sesión nueva. La salida de `install` dice lo contrario para los workflows: «los encuentra por nombre una sesión abierta».

## Reproducción

Sonda con Claude Code 2.1.323 y Haiku, en un directorio desechable con git y un agente de una línea (`name: probe-494`):

1. Una sesión interactiva en tmux: invocar `Agent` con `subagent_type: probe-494` → no existe (esperado).
2. Con la sesión abierta, crear `.claude/agents/probe-494.md` desde afuera.
3. Mismo pedido en el turno siguiente de la misma sesión.
4. El mismo pedido en un proceso nuevo: `claude -p` en el directorio, y `claude -p --resume <id>` sobre la sesión de `-p`.

También se probó en un solo turno de `claude -p` que espera al archivo con `until [ -f … ]` antes de invocar.

## Síntoma

Paso 3, en la sesión interactiva, con el archivo creado a las 15:40:13:

```
Agent type 'probe-494' not found. Available agents: architecture-reviewer, claude, claude-code-guide, Explore, …
```

Paso 4, proceso nuevo y `--resume`: `PROBE-OK` en los dos.

En la corrida a ciegas (`/var/tmp/ciego-494`, Claude Code 2.1.318), el `.jsonl` lo muestra igual. `init` imprime `✓ claude: instalado .claude/agents/cauce-clerk.md` a las 20:05:44. `/autobuild` muere a las 20:08:27:

```
failed: Error: agent({agentType}): agent type 'cauce-clerk' not found. Available agents: claude, Explore, general-purpose, Plan, statusline-setup, web-fetch
```

Los tipos aparecen recién a las 20:12:24 (`agent_listing_delta`, `addedTypes: ["cauce-clerk", "cauce-scribe"]`), en la reanudación con `--resume`, que es un proceso nuevo. El informe de esa corrida dice que «más tarde aparecieron solos», y la sonda lo desmiente: no aparecen en la sesión que sigue abierta, ni en su turno siguiente.

## Causa raíz

- Mecanismo del runner, **verificado** en 2.1.323 con la sonda de arriba: los tipos de agente se leen al arrancar el proceso.
- `engine/cli/wiring.js:202-204`: el cierre de `init` dice «Abrí claude acá y contestale esa pregunta». No distingue entre una sesión ya abierta y una nueva.
- `engine/automation/index.js:405`: `install` imprime que los workflows «los encuentra por nombre una sesión abierta». Es cierto para los workflows (`/autobuild` arrancó) y no para los agentes que esos workflows necesitan.
- `README.md:120-124` dice dónde se abre la sesión, no cuándo.

## Fix propuesto

1. `automation install` (y por él `init`), cuando instala agentes y corre dentro de una sesión de Claude Code, cierra con una línea propia: «Esta sesión se abrió antes de instalar: los subagentes de Cauce no existen en ella hasta que abras una nueva en <ruta>». Lo detecta con `CLAUDECODE=1`, que Claude Code exporta a los comandos que corre (**verificado** con `env` en esta sesión: `CLAUDECODE=1`, `CLAUDE_CODE_ENTRYPOINT=cli`).
2. La línea de los workflows en `index.js:405` deja de decir «una sesión abierta» cuando hay agentes en la misma instalación.
3. El README, en «El primer ciclo», dice que después de `init` se abre una sesión nueva.
4. Prueba: con `CLAUDECODE=1` la salida de `install claude` trae la línea; sin la variable no la trae. Mutación: sacar la condición pone roja la segunda aserción.

## Tradeoffs

- **Los otros runners no están medidos.** Codex ya pide abrir sesión para confiar los hooks (`engine/cli/wiring.js:288`). Gemini y Antigravity pueden registrar distinto, y la línea no se les extiende sin medirlos.
- **`CLAUDECODE` no es una interfaz documentada.** Si cambia de nombre, la línea deja de salir y no falla nada. La prueba fija el nombre, y el README cubre el caso igual.
- Quien corre `init` desde una terminal suelta no ve nada nuevo.

## Contexto de descubrimiento

Paso 6 del informe de la corrida a ciegas del caso 494 (2026-11-05). Contrastado contra su `.jsonl` y medido con la sonda el 2026-11-13.

## Relacionados

- 494, de donde sale.
- 503: la misma sesión abierta antes de `init` tampoco tiene registrado el pedido de la persona. El remedio de abrir una sesión nueva sirve para los dos, y conviene construirlos juntos.
