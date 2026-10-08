---
caso: 334
titulo: governance es inerte con ops dentro del repositorio
estado: resuelto
resuelto-en: 0.105.0
prioridad: alta
version-detectada: 0.104.1
---

# 334 — `governance` compara rutas contra `^planning/` y es inerte en el layout por defecto, con `ops/` dentro del repo

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **alta**.

**Prioridad alta**: es el guard que protege reglas, ADR, el contrato de un cargo y sus casos de evaluación,
y no frena nada en la instalación que `init` crea por defecto. Nadie lo nota, porque el commit sale igual.

## Resumen

El patrón de rutas gobernadas empieza con `^(?:(?:template\/)?planning\/…`, `automatization\/`, `engine\/` y
`agents\/…`. Las rutas staged salen de `git diff --cached --name-only`, relativas a la raíz del repositorio
git. Con `ops/` dentro del repo —el modo `sidecar` por defecto de `init`— cada ruta empieza con `ops/`, no
matchea, y el commit pasa. Sólo gobierna en embedded, en un sidecar que es su propio repositorio, y en el
toolkit.

## Reproducción

Sobre la instancia de 333, en una rama:

```bash
echo "- parche" >> ops/planning/rules/system/process.md && git add ops/planning/rules/system/process.md
printf '%s' '{"session_id":"s","cwd":"'$PWD'","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m \"docs: rule\""}}' \
  | CLAUDE_PROJECT_DIR=$PWD ops/automatization/hooks/guard-shell.sh; echo "exit=$?"
```

Lo mismo con `ops/agents/roles/x/SKILL.md` nuevo, con `ops/planning/adr/001-x.md`, con `agent_id` en el
payload (subagente) y con `CI=1`.

## Síntoma

```
exit=0
```

En los cinco. Sin salida del guard, con o sin persona hablando, como subagente y en CI.

## Causa raíz

- `engine/hooks/shell.js`, `governance`: `governedPattern` ancla en `^` rutas que empiezan por `planning/`,
  `automatization/`, `engine/`, `agents/`.
- `engine/hooks/input.js`, `stagedForCommit` → `stagedFiles(dir)`: devuelve las rutas tal como las imprime
  `git diff --cached --name-only`, relativas al directorio git, sin relativizarlas a la raíz ops.

## Fix propuesto

Relativizar cada ruta staged a la raíz ops antes de aplicar el patrón: `path.relative(opsRoot, path.join(dir,
file))`, y descartar las que queden fuera (`..`). Así `ops/planning/rules/…` se juzga como
`planning/rules/…` en cualquiera de los tres layouts, y lo que no es de la instancia no entra. Una prueba por
layout: embedded, sidecar dentro del repo, sidecar hermano.

## Tradeoffs

- En el toolkit la raíz ops es el propio repo, así que el cambio no mueve nada ahí; el prefijo `template/`
  sigue haciendo falta para `template/planning/`.
- Un commit que toca gobernanza de **otra** instancia en el mismo repo no se juzga; es lo que R26 pide.

## Por qué hacerlo

Lo que el guard protege se cambia por un ciclo con firma humana: la propuesta mensual, la aprobación, el
`agent-promote`. Si el commit directo pasa, el ciclo entero es opcional y nada lo dice. R27: la lista de lo
protegido existe, pero el prefijo la deja fuera en el caso por defecto.

## Riesgos y regresiones

1. **Instancias que hoy editan reglas propias sin aprobación** empiezan a frenar en el commit. El guard tiene
   su salida por chat y por `.ops-approval`; lo que cambia es que se pregunta.
2. **`learning/proposals/` y `evaluations/cases/` de cargos forkeados** quedan cubiertos, que es lo que el
   patrón ya dice; la prueba debe cubrir un cargo propio en `ops/agents/roles/`.

## Contexto de descubrimiento

Campaña del 2026-10-08. Primero se sospechó de la exención por persona presente (`CHAT.said`); se descartó
repitiendo con `agent_id` y con `CI=1`, que también pasaron. La causa salió leyendo el patrón contra la
salida de `git diff --cached --name-only` del banco.

## Relacionados

- 333, el otro guard de commit atado a la raíz git.

## Cierre

Recorrido contra el caso entero, no sólo contra «Fix propuesto»:

- **Relativizar cada ruta staged a la raíz ops** — hecho, en `governance` de `engine/hooks/shell.js`: la
  ruta se resuelve contra el toplevel del repositorio y se relativiza a `opsRoot(input)` sólo para juzgarla;
  lo que se aprueba y se nombra sigue siendo la ruta del índice. Se hizo distinto en un detalle que el caso
  no preveía: `stagedForCommit` devuelve el cwd del comando como `dir`, no la raíz del repo, y desde `ops/`
  la ruta `ops/planning/…` resolvía a `ops/ops/planning/…`. Por eso entra `git rev-parse --show-toplevel`.
- **Una prueba por layout** — hecho con dos de los tres, en `test/hooks/commit.test.js`: `ops/` dentro del
  repo, con el commit lanzado desde la raíz y desde `ops/`, y lo que queda fuera de la instancia. El embebido
  y el toolkit ya estaban cubiertos por las pruebas existentes de gobernanza, que corren sin raíz ops y
  siguen en verde: 15 de 15 en la suite, 241 de 241 en `test/hooks/`.
- **Tradeoff «en el toolkit no mueve nada»** — comprobado: las cuatro pruebas previas de gobernanza, que
  usan rutas sin prefijo, no cambiaron de veredicto.
- **Tradeoff «otra instancia en el mismo repo no se juzga»** — cubierto por la tercera aserción de la prueba
  nueva: un `planning.md` fuera de `ops/` no frena.
- **Riesgo «instancias que editan reglas propias empiezan a frenar»** — es el comportamiento buscado; la
  salida por chat y por `.ops-approval` no cambió.

Cómo se supo que funciona:

- Rojo previo: la prueba nueva falló con «Missing expected exception» antes del arreglo, y pasó después.
- Mutación: `const repo = dir` en vez del toplevel deja la suite en 14 de 15, con la aserción desde `ops/`
  en rojo; restaurado, 15 de 15.
- Corrida real sobre el banco de la campaña, una instancia sidecar dentro del repo con el motor del fuente:
  `git commit` con `ops/planning/rules/system/process.md` staged, desde la raíz y desde `ops/`, devuelve
  `BLOQUEADO: El commit toca gobernanza protegida.` con exit 2 en los dos casos. Antes del arreglo los dos
  daban exit 0.

### Segunda pasada, tras la revisión del conjunto

La revisión independiente del diff entero encontró que el arreglo seguía inerte con la instancia alcanzada por
un enlace simbólico: `run-hook.sh` exporta la raíz ops con el `pwd` lógico, que conserva el enlace, y git
contesta el toplevel real; relativizar una contra el otro daba `../../…` y el patrón no matcheaba. Se
reprodujo con un enlace al banco y el commit pasó. Ahora los dos lados se comparan reales con `realPath` y
`toplevel` de `input.js`, que son los mismos que usa `verify` —la revisión también encontró tres copias del
mismo «está adentro de» y quedó una, `within`—. Prueba nueva con el repositorio enlazado, en rojo antes y en
verde después; mutación —comparar la raíz ops sin resolver— en rojo; corrida real por el enlace al banco:
«BLOQUEADO: El commit toca gobernanza protegida.», exit 2.

