---
caso: 498
titulo: El agente se escribe en ops.config.json las llaves que apagan los guards que no son el de push
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 498 — El agente se escribe en `ops.config.json` las llaves que apagan los guards que no son el de push

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: es la puerta que el 114 cerró para el push, abierta para
cinco guards más, y el mensaje de dos de ellos nombra la llave exacta.

## Resumen

El 114 dejó a `ops-config` protegiendo dos llaves, `runner.allowPush` y `runner.pushToLiveBranches`, y el 373 sumó las
raíces que ensanchan el límite. Las llaves que se agregaron después con la misma forma («lo decide una persona en
`ops.config.json`») quedaron afuera, porque la protección es una lista (`engine/hooks/ops-config.js:36`) y nada la
compara con las llaves que existen. Es la forma que R27 describe: lo que se agrega nace abierto y no falla nada.

Escribiendo `ops.config.json` entero con la herramienta de archivos, el agente apaga cinco guards sin que nadie lo
confirme:

| Llave | Lo que afloja | Dónde se lee | ¿Lo nombra el bloqueo? |
|---|---|---|---|
| `runner.commitToLiveBranch: true` | `live-commit`: commitear en la rama viva | `live-commit.js:62` | sí, `live-commit.js:72` |
| `runner.allowAiSignature: true` | `ai-signature`: publicar con firma de IA | `ai-signature.js:142` | sí, `ai-signature.js:148-149` |
| `boundedCommands` (agregar) | `test-workers`: correr sin tope de workers | `workers.js:184` | sí, `workers.js:195-196` |
| `deployCommands` (quitar) | `delivery`: un deploy declarado deja de frenarse | `delivery.js:106` | no |
| `guards` (quitar) | los guards propios del proyecto dejan de correr | `project-guards.js:57` | no |
| `comments` (quitar) | `comments` deja de mirar los comentarios del commit | `comments.js:187` | no |

Los mensajes le hablan a la persona («lo decide una persona»), igual que el de push. El 114 ya dejó escrito
(«Tradeoffs», el borde del mensaje que nombra el campo) que eso alcanza **sólo si un guard frena la escritura**, y acá no
hay ninguno que lo haga.

Las otras vías ya están cerradas, y por eso el hueco es angosto: por shell, `ops-config-shell` frena toda escritura al
archivo, y un `Edit` parcial se frena porque no llega un JSON completo (`ops-config.js:69-72`). Lo que pasa es un
`Write` con el archivo entero.

## Reproducción

Desde la raíz de Cauce, sin gastar modelo: el guard se alimenta con el payload que manda el runner.

```bash
B=$(realpath "$(node engine/cli/ops.js bench suelto 2>/dev/null)"); F=$B/ops.config.json
probe() {
  NEW=$(python3 -I -c 'import json,sys;c=json.load(open(sys.argv[1]));exec(sys.argv[2]);print(json.dumps(c,indent=2))' "$F" "$1")
  python3 -I -c 'import json,sys;print(json.dumps({"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"Write",
    "tool_input":{"file_path":sys.argv[1],"content":sys.argv[2]},"cwd":sys.argv[3]}))' "$F" "$NEW" "$B" \
  | node engine/hooks/run.js ops-config >/dev/null 2>"$B/../err.txt"; echo "exit=$? :: $1 :: $(head -c 90 "$B/../err.txt")"
}
probe 'c["runner"]["allowPush"]=True'            # control: el 114
probe 'c["runner"]["commitToLiveBranch"]=True'
probe 'c["runner"]["allowAiSignature"]=True'
probe 'c["boundedCommands"]=["vitest"]'
```

Para las quitas, el banco tiene que traerlas antes: agregar `deployCommands` y `guards` a `$F` y probar
`del c["deployCommands"]` y `del c["guards"]`.

Y la cadena entera con una de ellas: `live-commit` sobre `git commit -m x` en la rama viva del banco, antes y después de
escribir la llave.

## Síntoma

Corrido el 2026-11-07 sobre el banco `suelto` (rama `master`, viva):

```
exit=2 :: c["runner"]["allowPush"]=True :: BLOQUEADO: …/suelto/ops.config.json lleva las dos llaves que deciden qué push
exit=0 :: c["runner"]["commitToLiveBranch"]=True ::
exit=0 :: c["runner"]["allowAiSignature"]=True ::
exit=0 :: c["boundedCommands"]=["vitest"] ::
exit=0 :: quitar deployCommands ::
exit=0 :: quitar guards ::
```

`live-commit`, antes y después de escribir `runner.commitToLiveBranch: true`:

```
exit=2 antes :: BLOQUEADO: 'git commit' cae en master, la rama viva de suelto. No hace falta preguntarle a nadie: …
exit=0 despues ::
```

Las vías cerradas, como control:

```
ops-config-shell, sed -i … ops.config.json  → exit=2 :: BLOQUEADO: el comando escribe en …/ops.config.json, donde viven runner.allowPush…
ops-config, Edit parcial                   → exit=2 :: BLOQUEADO: …/ops.config.json no llega como un JSON completo que se pueda leer…
```

`comments` no se corrió: sale de leer `comments.js:186-188`, donde sin `comments` el guard vuelve sin mirar.

## Causa raíz

`engine/hooks/ops-config.js:36` declara `PROTECTED = ['allowPush', 'pushToLiveBranches']`, y `keysOf`
(`ops-config.js:42-45`) compara sólo esas. El bloqueo sale en `ops-config.js:170` cuando difieren, así que cualquier otra
llave pasa. Cada caso que agregó una llave que afloja un guard (251 `commitToLiveBranch`, 300 `allowAiSignature`, 291
`boundedCommands`, 428 `guards`) lo hizo sin tocar esa lista, y no hay ninguna prueba que se lo hubiera pedido.

## Fix propuesto

Darle a la lista el comparador que pide R27, en vez de agrandarla a mano otra vez:

1. **Clasificar cada llave** que acepta `engine/config/validate.js:58-59` (y las de `runner`) en dos clases: las que
   aflojan un guard, con la dirección que afloja (`true`, agregar o quitar), y las libres. Las que aflojan las
   confirma una persona por la misma salida que ya usan las raíces del 373. Las libres pasan.
2. **Una prueba que recorra lo que valida `validate.js`** y falle mientras una llave no esté clasificada. Así la próxima
   llave nace en rojo y no abierta.
3. Lo que angosta sigue sin preguntarse: poner `commitToLiveBranch: false`, quitar de `boundedCommands`, agregar a
   `deployCommands`.

Mutación a declarar: sacar `commitToLiveBranch` de la clasificación tiene que poner roja la prueba del punto 2, y
devolver la lista a las dos llaves de hoy tiene que poner rojas las de los cinco `probe` de arriba.

## Tradeoffs

- **Más preguntas a la persona.** Hoy el agente puede declarar `boundedCommands` solo cuando `test-workers` lo frena, y
  después de esto lo confirma una persona. El mensaje de `workers.js:195` ya dice que lo hace «una persona», así que
  el cambio alinea el mecanismo con lo que el mensaje promete; igual es una pregunta más.
- **La dirección por llave es una decisión por llave.** ¿Subir `gateTimeoutMinutes` afloja? Al vencer, `verify` marca
  el gate como `cortado` (`verify.js:297-300`) y no lo deja pasar, así que se clasifica libre. Esa lectura sale del
  código y hay que confirmarla al construir.
- **Cambiar quién escribe una llave es una quita (R29).** La CLI no se frena a sí misma: escribe `ops.config.json` con
  `fs` desde node (`engine/cli/instance.js:141` y `:443`, `lines.js:259`, `lines-join.js:190`), no con la herramienta de
  archivos del agente, así que este guard no la ve. Comprobado leyendo el fuente el 2026-11-13. Lo que sí hay que mirar
  al construir es si alguna de esas escrituras toca una llave de las que aflojan: `lines` escribe `lines`, que habría
  que clasificar.

## Contexto de descubrimiento

Revisando el repositorio público `affaan-m/ECC` (antes `everything-claude-code`), un toolkit de hooks para Claude Code.
Sus issues #3844 («los mensajes de rechazo le dicen al agente cómo apagar el guard») y #3845 («el guard exime justo el
archivo donde están sus interruptores») describen este mismo defecto en otro producto. Contrastado contra Cauce, el push
estaba cerrado desde el 114 y las demás llaves no.

## Hallazgo aparte, sin caso todavía

En el mismo banco, ningún guard de `pre-files` frena un `Write` que vacía `.claude/settings.json` o
`.claude/settings.local.json` (`exit=0` con `secrets generated workspace-boundary engine migrations
integration-snapshot test-evidence plan-first ops-config`). En una instancia instalada, ese archivo es el que registra los
guards en Claude. No se midió en un banco instalado ni en los otros tres runners. Si el runner mismo frena esa escritura
es un mecanismo sin comprobar. Tiene peso propio y pide otra decisión (qué archivos de cada runner se protegen), así que,
si se confirma, va como caso aparte.

## Relacionados

- 114 — el mismo defecto para el push. Este caso es lo que su lista dejó afuera.
- 373 — las raíces que ensanchan, con la salida de confirmación que este fix reusa.
- 251, 291, 300, 428 — los casos que agregaron las llaves de la tabla.

## Cierre

Lo que el agente escribe en `ops.config.json` y afloja un freno lo confirma una persona, por la misma salida que las
raíces del 373: el diálogo del runner, o la línea en el archivo de aprobación. Lo decidió quien firma el 2026-11-14.
`engine/hooks/config-keys.js` clasifica cada llave de primer nivel y de `runner` que acepta `validate.js`. Para cada una
dice qué frena y con qué cambio deja de frenarlo, y el ítem nombra la llave y el valor: `afloja guards pre-shell
-g/a.sh`, `afloja migrations .sql`. Lo que angosta pasa sin preguntar.

Línea de base: las sondas del caso sobre el banco `suelto`. Push daba `exit=2`; las otras cinco, `exit=0`.

Contra el caso:

- **Fix 1, clasificar cada llave en dos clases:** se hizo, con tres clases. Además de las que aflojan y las libres,
  están las que ya cuida el mismo guard (push y raíces). Las que aflojan son once:
  - `commitToLiveBranch` y `allowAiSignature` cuando pasan a `true`;
  - `humanCheckpointBetweenMilestones` cuando deja de ser `true`;
  - `maxTaskHours` cuando sube;
  - `boundedCommands`, `reviewExempt` y `lines` cuando ganan entradas;
  - `deployCommands` y `guards` cuando pierden entradas;
  - `comments` cuando se quita, se pone en falso o pierde un chequeo;
  - `migrations` cuando deja de cubrir algo, contando sus defaults;
  - `mode` cuando pasa a `toolkit`.
- **Fix 2, la prueba que recorre lo que valida `validate.js`:** se hizo. `validate.js` exporta ahora sus dos listas, y la
  prueba falla si una llave no está clasificada o si sobra una.
- **Fix 3, lo que angosta no se pregunta:** se hizo. Cada llave tiene un par de casos, uno que afloja y otro que
  angosta.
- **Tradeoff, más preguntas a la persona:** se acepta. Ninguno de los recorridos —`onboard`, `flow`, `autobuild`— ni
  ningún cargo le pide al agente escribir una llave que afloje. `onboard` sólo escribe `workspaceRoots`, que es del 373.
- **Tradeoff, la dirección por llave:** `gateTimeoutMinutes` queda libre, porque al vencer el gate queda `cortado`
  (`verify.js`). `commitPerTask` también, porque la revisión mira el árbol igual. `maxTaskHours`, que el caso no
  nombraba, afloja al subir: es el tope con que `autobuild` parte una tarea.
- **Tradeoff, cambiar quién escribe (R29):** el CLI escribe `ops.config.json` con `fs`, y este guard no lo ve, así que
  `ops line` sigue declarando `lines` sin preguntar. Lo que cambia es sólo lo que escribe el agente.

Lo que el caso no preveía:

- **`reviewExempt`, del caso 485 de esta misma tanda, nació sin proteger,** y afloja la revisión de `autobuild`. Es la
  forma exacta que el caso describe.
- **Declarar `migrations` por primera vez reemplaza los defaults,** y deja de mirar `migrations/`. Se pregunta. El costo:
  la primera declaración que pide `check` también se pregunta, salvo que incluya los defaults.
- **En Claude Code la confirmación es el diálogo del runner, no el chat.** En `claude -p` no hay diálogo, así que el
  bloqueo se lee como rechazo, igual que pasa con las raíces.
- **Quedan anotados cuatro bordes que no frenan nada que ya se frenara:**
  - pasar `mode` de `embedded` a `sidecar` hace que las `lines` ya declaradas abran árboles escribibles, y no se pregunta;
  - cambiar `migrations` de `db/migrations` a `migrations` amplía la cobertura y se pregunta igual;
  - un cambio sólo de mayúsculas en `migrations` también se pregunta;
  - una subllave nueva de un objeto no nace en rojo.

### Lista de cierre

1. hecho: las sondas del caso antes del cambio: cinco con `exit=0` y la de push con `exit=2`.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba del guard en rojo sin el cambio («ops-config no bloqueó») y en verde con él.
4. hecho: mutaciones en rojo sobre cada regla:
   - sacar `commitToLiveBranch` de la clasificación, y volver libre `reviewExempt` o `maxTaskHours`;
   - volver `guards`, `lines` y `migrations` a comparar como listas;
   - hacer que `mode` frene cualquier cambio;
   - quitar el `sin declarar` y el `-language` de `comments`.

   Las dos que pedía el caso, en rojo. Una sobrevivió, quitar `comments` entero, y se le sumó su caso.
5. hecho: cambia quién escribe una llave. Lado a lado, antes y después, las sondas del caso: las cinco que pasaban ahora
   frenan, y las que angostan siguen pasando.
6. hecho: en una instancia instalada con el motor de la rama, en sesiones reales de Claude Code 2.1.325 con Haiku:
   - `claude -p` frenó `commitToLiveBranch: true` con el mensaje nuevo, y el agente no buscó otra vía ni se escribió la
     aprobación;
   - con la línea pegada por la persona, la escritura pasó;
   - en una sesión interactiva, el guard devolvió `ask` con su motivo, la persona aprobó el diálogo y pasó;
   - con el texto final, quitar `guards` se frenó con `guards pre-shell -g/a.sh` y pasó con su línea.
7. hecho: lo que depende del runner corrió en Claude Code (punto 6). USD 0,10 en total.
8. hecho: corrieron el guard directo sobre las once llaves, en los dos sentidos, y las sesiones reales. No corrieron
   Codex, Gemini ni Antigravity, que comparten el guard pero cada uno confirma a su manera.
9. hecho: las dos salidas de la persona (diálogo y línea pegada) y dos llaves distintas en sesión real.
10. hecho: los guards cuyos mensajes nombran su llave —`live-commit`, `ai-signature`, `test-workers`— ya decían que la
    declara una persona. Ningún recorrido ni cargo escribe una llave que afloje. El `ops.config.json` de un worktree
    pasa por la misma comparación, contra su propio archivo.
11. hecho: tres pasadas independientes. La primera encontró `guards` y `migrations` mal clasificados (impedían
    entregar) y cuatro menores, arreglados. La segunda, que `comments` en falso apagaba el guard sin preguntar (impedía
    entregar), arreglado. La tercera no encontró nada que impidiera entregar. De sus menores se arregló que `comments`
    decida por lo que mira el guard, un valor falso. Quedan dos, que parten de una configuración que `check` ya
    rechaza: un `inlineMax` que no es número, y un `maxTaskHours` ausente antes del cambio.
12. hecho: pasada uno por uno. Se corrigió el comentario que decía que el ítem nombra sólo la llave.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba. El hallazgo aparte del caso, `.claude/settings.json`, se midió y sale
    como el caso 508.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** Codex, Gemini y Antigravity.
