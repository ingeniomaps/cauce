---
caso: 509
titulo: En una instancia no hay banco de evaluación, así que /agent-eval no le entrega al cargo los archivos de sus casos y /flow-eval no corre
estado: resuelto
resuelto-en: 0.121.0
prioridad: alta
version-detectada: 0.120.0
---

# 509 — En una instancia no hay banco de evaluación, así que /agent-eval no le entrega al cargo los archivos de sus casos y /flow-eval no corre

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **alta**: una empresa que forkea un cargo y lo evalúa recibe un registro
con veredictos que no miden lo que dicen, y `/agent-promote` vuelve a correr esos mismos casos antes de aplicar una
propuesta.

## Resumen

El banco por caso —la instancia desechable donde el cargo responde y donde quedan sus archivos de trabajo— sólo se arma en
`mode: toolkit`. En una instancia:

1. **`/agent-eval` sobre un cargo forkeado** le dice al cargo que el pedido «viene con estos archivos, en tu instancia: -
   plan.md - src/checkout-handler.js», rutas que en la instancia no existen. Los archivos viven en
   `agents/roles/<cargo>/evaluations/cases/<caso>/`, y el mismo prompt le prohíbe leer `evaluations/`. El cargo responde
   sin haberlos visto, el juez sí los lee, y el registro se escribe igual.
2. **`/flow-eval`** se instala en cada instancia (`.claude/workflows/flow-eval.js`) y ahí se detiene siempre con
   `fuera-del-toolkit`. Una empresa que escribe sus propios recorridos no tiene cómo evaluarlos.

Es una sola decisión: si una instancia puede tener banco de evaluación. Con banco, se arreglan los dos; sin él, el 1 pide
otra forma de entregar los archivos y el 2 pide no instalarse.

## Reproducción

Con el paquete publicado, en un proyecto vacío con git (la prueba de punta a punta del 2026-11-14 usó Node):

```bash
npx -y @ingeniomaps/cauce@0.120.0 init --runner claude --install
node ops/tools/ops.js agents fork software-architect ops
node ops/tools/ops.js automation install ops claude
claude -p '/agent-eval software-architect — sólo 07-approval-without-looking y 09-invoice-moves-to-a-worker'
claude -p '/flow-eval intake — sólo 04-translate-the-ask'
```

Cuesta unos USD 4 la primera y USD 1 la segunda. Sin modelo, la mitad que importa se ve leyendo el prompt que arma el
recorrido para un caso con `fixtures` cuando `context.mode` no es `toolkit`.

## Síntoma

`/agent-eval` (sesión 827e29d4, USD 4,12):

```
| 07-approval-without-looking | pasa (4/4) | Se negó a aprobar sin haber abierto el diff …
| 09-invoice-moves-to-a-worker | no pasa (0/4) | No leyó plan.md ni los dos archivos de src/ …
Problema de fondo: el cargo nunca tuvo acceso a los archivos de los casos. Los archivos que cada caso le pasa al cargo
(pr-318.diff, plan.md, src/*.js) existen sólo bajo ops/agents/roles/software-architect/evaluations/…. Esa carpeta le
está prohibida al cargo mientras responde. Los encontró, no los abrió, y lo dijo las dos veces.
```

El registro quedó en `agents/roles/software-architect/evaluations/results/2026-11-15.md` con esos dos veredictos. El 07
«pasa» por la razón equivocada: se negó porque no podía leer el diff, no por la conducta que el caso mide.

`/flow-eval` (sesión faa8527a, USD 1,03):

```
No se evaluó nada: el workflow se detuvo en la primera fase … fuera-del-toolkit. Evaluar un recorrido necesita un banco
desechable, y eso sólo existe en el repo de Cauce.
```

## Causa raíz

- `automatization/workflows/agent-eval.js:128-129`: `benchPath` queda `null` salvo en `mode: toolkit`.
- `automatization/workflows/agent-eval.js:172`: «No leas ningún archivo bajo evaluations/».
- `automatization/workflows/agent-eval.js:181`: los fixtures se nombran por su ruta relativa al caso, «en tu instancia»,
  que sólo es cierto dentro de un banco, donde `evaluate --bench` los copió.
- `automatization/workflows/flow-eval.js:113`: se detiene si `context.mode !== 'toolkit'`.
- `automatization/runners/claude/manifest.json:66-67`: `flow-eval` se instala igual en toda instancia.
- `engine/cli/bench.js:351`: `evaluate --bench` se niega fuera del toolkit; el `AGENTS.md` lo explica: «en una empresa
  lo que hay que medir es su propia instancia».

Alcance medido sobre el catálogo de 0.120.0 con `evaluate <cargo> --cases --json` para cada cargo de `agents list`: 86
de 425 casos traen fixtures, y los 53 cargos tienen al menos uno. En `software-architect`, 4 de 9 (06, 07, 08 y 09).
Cualquier cargo que una empresa forkee hereda casos que en su instancia no se pueden medir.

## Fix propuesto

**Decisión que pide a la persona:** si una instancia puede tener banco de evaluación.

- **A — banco en la instancia (recomendada).** `evaluate --bench` acepta un cargo o recorrido propio fuera del toolkit y
  arma el banco bajo `<instancia>/.cauce-eval/` (gitignoreado), con los fixtures copiados, igual que en el toolkit.
  `agent-eval` y `flow-eval` usan `benchPath` siempre que el sujeto sea propio. Arregla los dos síntomas con un mismo
  mecanismo que ya existe y está probado, y el cargo deja de trabajar sobre el `planning/` real de la empresa.
- **B — sin banco.** `agent-eval` copia los fixtures de cada caso a un directorio desechable del temporal y le nombra
  esas rutas absolutas; `flow-eval` deja de instalarse en instancias (o se instala y se dice en el `install` que es del
  toolkit). Más chico, pero el cargo sigue escribiendo en el `planning/` real mientras se lo mide, que es lo que el banco
  vino a evitar.

En cualquiera de las dos: un caso con fixtures que el cargo no pudo leer no se registra como veredicto. Si la copia
falla, el caso sale «sin medir», no «pasa».

## Tradeoffs

- A agrega un directorio por caso dentro de la instancia mientras dura la corrida; lo cubre `.gitignore` y se borra al
  rehacerse, como en el toolkit.
- A cambia lo que decide `bench.js:351`, que hoy es una negativa explícita con su razón. La razón —no medir sobre el
  `planning/` de la empresa— la cumple mejor A que la situación actual.
- Los registros ya escritos en instancias con estos casos no valen; no hay cómo distinguirlos salvo por la fecha.

## Contexto de descubrimiento

Prueba de punta a punta de 0.120.0 (2026-11-14), en un proyecto Node de prueba con Claude: después de forkear
`software-architect` para correr el ciclo de una propuesta mensual dentro de la instancia.

## Relacionados

- 487–490: casos de eval con fixtures, construidos y medidos en el toolkit, donde el banco existe.
- `AGENTS.md`, «El banco de evaluación».

## Cierre

Se tomó la opción A. En una instancia, `evaluate <sujeto> --bench <caso>` arma el banco para un cargo o recorrido propio
(`EV.owned`, en `engine/agents/evaluations.js`), y `--cases --json` dice `owned`. El banco es una copia de la empresa, no
del molde: `organization/`, `planning/rules/`, y sus `agents/` y `flows/` sin `evaluations/` ni `learning/`; después, los
archivos del caso. `.cauce-eval/` se ignora a sí mismo. `agent-eval` y `flow-eval` usan el banco en el toolkit o con un
sujeto propio, y con uno del catálogo se niegan diciendo cómo hacerlo propio.

Línea de base: las dos corridas del caso (sesiones 827e29d4 y faa8527a).

Contra el caso:

- **Fix A, banco en la instancia:** se hizo, para cargos y recorridos.
- **Fix B, sin banco:** se decidió que no, por la opción tomada.
- **Un caso con archivos que el cargo no pudo leer no se registra:** se hizo distinto. Con el banco los archivos están
  siempre donde el prompt los nombra, así que el caso no ocurre por este camino. Si el banco no se puede armar, la corrida
  ya frena con `banco-sin-rehacer` o `sin-banco` antes de responder.
- **Tradeoff, un directorio por caso dentro de la instancia:** se paga; `.cauce-eval/.gitignore` lo deja fuera de git.
- **Tradeoff, cambiar la negativa de `bench.js`:** se hizo. Dos pruebas de `bench.test.js` fijaban la decisión vieja («el
  banco es del toolkit»; «forkear no habilita nada») y se reescribieron al contrato nuevo.
- **Tradeoff, registros viejos que no valen:** dicho en el CHANGELOG.

Lo que el caso no preveía, de la primera revisión: el banco armado desde el molde medía al cargo sin el contexto de la
empresa, y un recorrido propio no encontraba los cargos propios de su elenco. Y de la tercera: un enlace absoluto de la
empresa, copiado al banco, seguía apuntando a la instancia viva; no se copia.

Queda anotado: el filtro descarta cualquier tramo llamado `evaluations` o `learning`, también dentro de `references/`.

### Lista de cierre

1. hecho: las dos corridas del caso, antes del cambio.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «un cargo propio tiene banco» y «un recorrido propio tiene banco», en `test/agents/bench.test.js`, en rojo sin
   el cambio y en verde con él.
4. hecho: mutaciones en rojo en una copia: el banco negado en toda instancia, sin copiar lo propio, sin el `.gitignore`
   del banco, con `evaluations/` copiado, `owned` sin excluir `node_modules`, `--cases` sin `owned`, sin la copia de
   `organization/` y reglas, sin `verbatimSymlinks` y sin descartar el enlace absoluto.
5. hecho: lo que se quita es la negativa del banco en la instancia. Las pruebas viejas que la afirmaban se reescribieron
   con su aserción de ausencia («el mensaje viejo no sale»), y la salida de antes y la de después de las corridas reales
   están en «Qué se corrió».
6. hecho: en el proyecto de punta a punta con el motor de la rama: `/agent-eval` del cargo forkeado y `/flow-eval` de un
   recorrido propio.
7. hecho: lo que depende del modelo corrió en Claude Code, con `claude -p`: USD 5,23, 4,91 y 3,19.
8. hecho: corrieron un cargo forkeado con dos casos con archivos, uno con el banco final, y un recorrido propio. Un cargo
   del catálogo se negó como debe. No corrieron Gemini ni Antigravity, que no tienen estos recorridos.
9. hecho: cargo y recorrido; sujeto propio y del catálogo.
10. hecho: `bench.test.js`, `workflows-eval.test.js` y el aviso del juez sobre el enlace, que ahora nombra el motor y no
    sólo el repositorio del toolkit.
11. hecho: tres pasadas independientes. La primera halló el banco sin la empresa; la tercera, el enlace absoluto. Ninguna,
    nada que impidiera entregar en este caso.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1806 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

`claude -p '/agent-eval software-architect …'` sobre el cargo forkeado:

```
antes   07 pasa porque no pudo abrir el diff; 09 0/4 sin haber visto el código («el cargo nunca tuvo acceso a los archivos»)
después 07 pasa: abrió pr-318.diff y encontró el timeout y el pool que se pierden
        09 3/4: leyó plan.md y src/*.js; falla en una condición de aceptación, no por falta de archivos
banco final, 07: pasa; el juez cita el workspace.md de la empresa, que el banco ahora trae
```

`claude -p '/flow-eval intake …'` sobre `flows/intake` propio: antes `fuera-del-toolkit`; después el caso 04 pasa, con el
recorrido corrido en el banco. `git status` de la instancia, después de cada una: sólo el registro, nada de `.cauce-eval/`.

**Sin probar:** un recorrido propio cuyo elenco tenga un cargo propio, corrido de verdad (la copia de `agents/` lo
cubre por código y prueba, no por corrida).
