---
caso: 513
titulo: Lo que la instancia necesita ignorar no llega al .gitignore del repositorio, y en embebido la mitad ni se avisa
estado: abierto
prioridad: media
version-detectada: 0.120.0
---

# 513 — Lo que la instancia necesita ignorar no llega al .gitignore del repositorio, y en embebido la mitad ni se avisa

**🔴 abierto** · detectado en 0.120.0 · prioridad **media**: en embebido, el primer `git add` de una carpeta deja entrar
planes de `wip/`, el staging de una integración o un `.env`, sin que `init` ni `check` lo hayan dicho.

## Resumen

El `.gitignore` de la instancia (`template/gitignore`) ignora lo que es de la máquina: `.env`, `.env.*`, los cuatro
rastros de `planning/`, `planning/wip/*.md`, `integrations/*/staging/`, `ops.config.local.json`, `.claude/workflows/` y
`.agents/plugins/cauce/hook.js`. Ese archivo sólo actúa adentro de la carpeta de la instancia, y deja dos huecos:

1. **Embebido.** La instancia es el repositorio del producto, y su `.gitignore` es del producto: `init --force` lo
   conserva tal cual y no le suma nada. `check` avisa por los cuatro rastros y por `.claude/workflows/`; de `.env`,
   `planning/wip/*.md`, `integrations/*/staging/` y `ops.config.local.json` no dice nada.
2. **Sidecar.** El wiring del runner vive en el padre (`.claude/workflows/`, `.agents/plugins/cauce/hook.js`), que el
   `.gitignore` de `ops/` no alcanza. `init` y `check` lo avisan y mandan a agregarlo a mano en cada proyecto.

Las dos son la misma decisión: si Cauce puede escribir en un `.gitignore` que no creó. Hoy la respuesta es que no
(`engine/core/trails.js:67-69`: «el archivo es de la empresa y Cauce no lo edita»), y la consecuencia es que una instancia
recién creada sale con avisos y con huecos que nadie ve.

## Reproducción

```bash
mkdir app && cd app && git init -q && printf 'node_modules/\n' > .gitignore && npm init -y >/dev/null
npx -y @ingeniomaps/cauce@0.120.0 init . --mode embedded --force --runner claude --install
node node_modules/@ingeniomaps/cauce/engine/cli/ops.js integration enable . jira    # y sync con --fixture
git status --short planning integrations
```

## Síntoma

En la prueba de punta a punta del 2026-11-14 (proyecto `embebido`):

```
= conservado /var/tmp/e2e-120/embebido/.gitignore          # contenido: node_modules/
⚠ 4 rastro(s) local(es) que git no ignora (planning/.verify-log, planning/.push-log, planning/.grant-log, planning/.ops-approval) …
⚠ 9 archivo(s) del runner llevan escrita la ruta de esta carpeta y git no los ignora (.claude/workflows/) …
```

Después de `integration sync`, `integrations/jira/staging/sync-state.json` y `…/stories/DEMO-42/remote.json` quedan sin
ignorar, y ningún aviso los nombra. En sidecar (proyecto `tienda`), el mismo aviso de `.claude/workflows/` sale en
`init` y se repite en cada `check` hasta que alguien edita el `.gitignore` de la raíz.

## Causa raíz

- `engine/cli/instance.js:46-49`: el `.gitignore` se escribe desde `template/gitignore` dentro de la instancia, y con
  `--force` se conserva el que había.
- `engine/core/trails.js:67-87` (`warnings`): sólo los cuatro rastros de `LOCAL`.
- `engine/automation/machine-bound.js:110-133`: sólo lo que el runner escribe con la ruta de la carpeta.
- No hay comprobación para `.env`, `planning/wip/*.md`, `integrations/*/staging/` ni `ops.config.local.json` cuando el
  `.gitignore` que los cubriría no es el de la instancia.

## Fix propuesto

**Decisión que pide a la persona:** si `init` puede agregar líneas a un `.gitignore` que no creó.

- **A — `init` (y `automation install`) agregan un bloque marcado (recomendada).** Al final del `.gitignore` que de
  verdad aplica —el del repositorio en embebido, el de la raíz del workspace para el wiring en sidecar— se agrega un
  bloque entre `# >>> cauce` y `# <<< cauce` con las líneas que faltan, y sólo ésas. `upgrade` lo actualiza,
  `destroy` lo saca. Lo que la persona escribió fuera del bloque no se toca. El aviso de `.claude/workflows/`
  deja de repetirse en cada `check`.
- **B — no escribir, avisar completo.** El aviso de `check` en embebido cubre las ocho entradas, no cuatro. Es lo mínimo,
  y deja el trabajo a mano en cada proyecto, que es lo que hoy se olvida.

## Tradeoffs

- A edita un archivo del producto. El bloque marcado es lo que lo vuelve reversible y revisable en el diff; sin
  marcas, `destroy` no sabría qué sacar.
- Si el producto ya ignora algo con otra forma (`*.env`), el bloque repite la intención. `git check-ignore` decide qué
  falta, igual que hoy `trails.js`, así que sólo se agregan las rutas que git todavía no ignora.
- El caso 128 resolvió que una línea nueva llegue a una instancia existente; esto lo extiende al `.gitignore` que no es
  el de la instancia. Hay que comprobar que las dos rutas no escriban la misma línea dos veces.

## Contexto de descubrimiento

Prueba de punta a punta de 0.120.0 (2026-11-14): `init` embebido sobre un proyecto Node, y después la integración de
Jira con el fixture de las pruebas.

## Relacionados

- 128 (línea nueva del `.gitignore` en una instancia existente), 222 (el staging de una integración es local), 445
  (rastros ya versionados).
