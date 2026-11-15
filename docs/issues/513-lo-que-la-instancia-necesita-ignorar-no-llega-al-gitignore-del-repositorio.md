---
caso: 513
titulo: Lo que la instancia necesita ignorar no llega al .gitignore del repositorio, y en embebido la mitad ni se avisa
estado: resuelto
resuelto-en: 0.121.0
prioridad: media
version-detectada: 0.120.0
---

# 513 — Lo que la instancia necesita ignorar no llega al .gitignore del repositorio, y en embebido la mitad ni se avisa

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **media**: en embebido, el primer `git add` de una carpeta deja entrar
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

## Cierre

Se tomó la opción A. `engine/core/ignore-block.js` escribe un bloque entre `# >>> cauce` y `# <<< cauce` en el
`.gitignore` que aplica:
- **embebido:** `init` y `upgrade` le suman lo de la instancia (`ignoreInstance`, en `engine/cli/instance.js`), y el
  molde ya no copia su `.gitignore` ahí;
- **el wiring del runner:** `automation install` suma lo que escribe con la ruta de la carpeta (`ignoreLoose`, en
  `engine/automation/machine-bound.js`), sólo si el repositorio es el de la instancia o el de la carpeta de instalación;
- **`destroy`** saca el bloque. `destroy` pasó a `engine/cli/destroy.js` para que `instance.js` no cruzara las 500 líneas.

Una línea entra si no la escribió ya la persona, si git no la cubre con otra regla, y si no ignoraría nada que el
repositorio versiona, contadas sus negaciones. Lo que se salta se dice, con los archivos que ignoraría.

Línea de base, en `/var/tmp/cauce-513-base` con el motor de 0.120.0: en embebido, `check` daba dos avisos (cuatro rastros
y `.claude/workflows/`), y quedaban sin ignorar `.env`, `planning/wip/r.md`, `integrations/jira/staging/sync-state.json`,
`ops.config.local.json` y los nueve recorridos. En sidecar, el aviso de `.claude/workflows/`.

Contra el caso:

- **Fix A, bloque marcado que `init` agrega, `upgrade` actualiza y `destroy` saca:** se hizo. En sidecar el bloque del
  padre lo escribe `automation install`, no `upgrade`, que sólo le pide reinstalar el runner.
- **Fix B, avisar completo:** no hizo falta: con el bloque, lo que avisaba queda ignorado. El aviso de `trails.js` y de
  `machine-bound.js` se queda para lo que el bloque no alcanza: un repositorio de más arriba, lo que ya está en git.
- **Tradeoff, editar un archivo del producto:** se paga, con las marcas y diciendo cada línea que se agrega.
- **Tradeoff, repetir una intención (`*.env` del producto):** se hizo distinto de lo que el caso esperaba. No se
  deduplica por la ruta de ejemplo sola: también por lo versionado, y la negación viaja con su línea.
- **Tradeoff, que el 128 y esto no escriban la misma línea dos veces:** comprobado. Una instancia embebida anterior, con
  el molde copiado entero, no recibe nada: todas sus líneas ya están fuera del bloque.

Lo que el caso no preveía, todo de las tres pasadas de revisión:
- copiar el molde entero en embebido ignoraba un `.env.production` o un recorrido propio en `.claude/workflows/` que el
  producto versiona (bloqueante de la primera);
- una línea juzgada sin su negación saltaba `planning/wip/*.md` en el `upgrade` de toda embebida, porque el README del
  molde ya está versionado (bloqueante de la segunda);
- `ignoreLoose` escribía en el `.gitignore` de cualquier repositorio de más arriba, como un `$HOME` versionado;
- git corría con las variables `GIT_*` del entorno;
- una embebida en una subcarpeta de un monorepo: `ls-files -x` compara desde la raíz;
- un `.gitignore` enlazado, y una marca de apertura sin la de cierre.

Quedan anotados, sin arreglar:
- `destroy` de una instancia saca el bloque entero del repositorio que comparte con otra; las líneas de la otra vuelven
  a aviso hasta que se reinstale, como antes de este caso;
- con `node_modules/` del producto y la carpeta todavía sin crear, el bloque repite `node_modules`, que es inocuo.

### Lista de cierre

1. hecho: la reproducción en `/var/tmp/cauce-513-base`, en embebido y en sidecar, con la salida de `check` y de `git status`.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: `test/instance/ignore-block.test.js` en rojo sin el bloque y en verde con él.
4. hecho: mutaciones en rojo en una copia: sin `ignoreInstance` en `init` y en `upgrade`, sin `ignoreLoose`, sin
   `remove`, sin el chequeo de versionados, sin las negaciones agrupadas, sin el control del repositorio de arriba, sin
   el chequeo de enlace, sin la traducción para subcarpetas, sin la línea de la persona, con el molde copiado en embebido
   y con el wiring dentro del bloque embebido.
5. hecho: lo que se quita es el aviso de lo que el bloque ignora. La salida de antes y la de después, sobre la misma
   reproducción, están en «Qué se corrió», y `install-shared-folder` y `machine-bound` siguen midiendo el aviso donde se
   queda.
6. hecho: la reproducción con el motor de la rama, en `/var/tmp/cauce-513-final`, y en el proyecto de punta a punta.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: corrieron embebido con y sin `.gitignore` previo, con archivos versionados, en una subcarpeta de un monorepo,
   sidecar con el repositorio en la carpeta del proyecto y con uno de más arriba, `upgrade` sobre una instancia sin
   bloque, y `destroy` en los dos modos. No corrió Windows.
9. hecho: dos modos de instalación y dos repositorios (el propio y uno de más arriba).
10. hecho: los comentarios de `trails.js` y `machine-bound.js` que afirmaban que Cauce no edita el `.gitignore`; las
    pruebas de `destroy`, de instancia y de `upgrade` siguen en verde.
11. hecho: tres pasadas independientes. La primera halló el molde copiado a ciegas (impedía entregar), el repositorio de
    arriba, `GIT_*`, la marca suelta y los comentarios. La segunda, las negaciones (impedía entregar). La tercera, nada
    que impidiera entregar; arreglé la subcarpeta del monorepo.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1806 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

Embebido, antes y después, con `check` y `git status --untracked-files=all` sobre `.env`, `planning/wip/r.md`,
`integrations/jira/staging/sync-state.json`, `ops.config.local.json` y `.claude/workflows/`:

```
antes   ⚠ 4 rastro(s) local(es) que git no ignora …   ⚠ 9 archivo(s) del runner … (.claude/workflows/)
        ?? .env  ?? integrations/jira/staging/sync-state.json  ?? ops.config.local.json  ?? planning/wip/r.md
        ?? .claude/workflows/<9 recorridos>
después (sin avisos)
        ?? planning/wip/README.md        ← es del molde y viaja
```

Sidecar: antes, el aviso de `.claude/workflows/`; después, `.claude/workflows/ al bloque de Cauce de …/.gitignore`, sin
aviso, y `destroy --force` deja el `.gitignore` en `node_modules/`, como estaba.

**Sin probar:** Windows, y un `.gitignore` con reglas de `core.excludesFile` del usuario.
