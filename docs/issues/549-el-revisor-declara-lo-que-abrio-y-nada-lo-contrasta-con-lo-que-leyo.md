---
caso: 549
titulo: el revisor declara en `opened` lo que abrió, y nada lo contrasta con lo que de verdad leyó
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 549 — el revisor declara en `opened` lo que abrió, y nada lo contrasta con lo que de verdad leyó

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: el cruce del 485 compara dos listas que escribe el propio
revisor, así que mide si dice haber abierto lo que tenía que abrir y no si lo abrió. Hoy, en lo medido, la declaración
coincidió con la transcripción: no hay un daño observado, hay una puerta que no puede ver uno. Ver «Prioridad».

## Decisión del 2026-11-22

Manuel eligió: primero el 552 (el clerk que falla abierto), y este caso como primera versión que **sólo anota**
la diferencia entre lo declarado en `opened` y lo que la transcripción muestra leído, sin frenar. Es sólo para Claude,
y en los otros runners el hecho de revisión dice que no se contrastó.

## Resumen

Desde el 485, Review devuelve en `opened` qué archivos del diff abrió. El recorrido lo cruza contra la lista de un clerk
y frena con `review-unbacked` si falta alguno. Pero `opened` lo escribe el revisor, igual que `consulted`, y nada lo
compara con lo que el agente hizo. Un revisor que copia la lista que recibe en el prompt pasa el cruce sin haber abierto
nada.

Una instancia sidecar real resolvió esto por su cuenta: un verificador que lee la transcripción del subagente revisor y
saca de ahí qué leyó, en vez de creerle.

Al medirlo apareció un segundo defecto, más grave y distinto, que sale como caso propio (ver «Hallazgo aparte»): en 4 de
7 corridas reales el clerk del diff tuvo su comando denegado y devolvió `files: []`. El recorrido lo leyó como un diff
vacío y no hubo cruce.

## Qué hace hoy el recorrido

Leído en `automatization/workflows/autobuild.js`, en esta corrida:

- `DECISION` exige `consulted` (`:207`, `:214`). Su comentario lo dice: «No prueba que lo haya leído bien» (`:197-199`).
  `MANIFEST` sólo pide llenarlo con lo que se abrió «de verdad» (`:620`).
- `REVIEWED` agrega `opened` (`:261-263`), pero no lo pone en `required` (`:257`). El prompt lo pide sólo si el clerk
  devolvió archivos (`OPEN`, `:1988-1989`).
- La lista contra la que se cruza la saca el clerk `review-diff` (`:1974-1979`), con el schema `DIFFED`, que sólo tiene
  `files` (`:543-546`). Le pide «No abras ningún archivo ni corras otra cosa» (`:548-551`).
- `required` es esa lista menos lo que ya estaba antes de Build y lo exento (`:1985-1986`). `unopened` compara por
  igualdad de cadenas contra `opened` (`:1987`).
- Si falta algo, hay una segunda pasada sobre lo que falta (`:2018-2030`). Si sigue faltando, la corrida para con
  `review-unbacked` (`:2032-2033`).
- Con `consulted` vacío también para (`:2148`). Si no, `consulted` va tal cual al hecho de revisión que llega a `done/`
  (`:2181-2182`).

En ningún punto se lee algo que no haya escrito el propio revisor.

## Reproducción

No hace falta gastar modelo: las corridas reales de `/autobuild` del 2026-11-22 dejaron sus transcripciones. Hay siete
bancos (`/var/tmp/cauce-run-{535,538a,538b,538c,538d,533a,533b}`), todos con la misma tarea de juguete
(`sumar-dos-numeros`) y Claude Code 2.1.330.

Dos sondas de Node, en el scratchpad de la sesión que escribió el caso (`case549/probe.js` y `case549/probe-opened.js`):

1. Recorren `$HOME/.claude/projects/-var-tmp-cauce-run-<banco>/<sesión>/subagents/workflows/<wf>/`.
2. Toman del `journal.jsonl` el `agentId` de las etiquetas `review-diff` y `review`, y su `result`.
3. Abren `agent-<agentId>.jsonl` y listan cada `tool_use` del asistente. De cada uno imprimen el nombre, la ruta (`Read`,
   `Grep`) o los verbos del comando (`Bash`), y si su `tool_result` vino con `is_error`.
4. `probe-opened.js` cruza cada archivo de `opened` con las llamadas exitosas que lo muestran, y dice de qué forma.

Las sondas imprimen sólo nombres de herramientas, verbos, rutas del banco y conteos. Nada del contenido.

## Síntoma

### Dónde está la transcripción y qué forma tiene

Lo que se ve en disco (**verificado** en esta máquina, Claude Code 2.1.330):

```
$HOME/.claude/projects/-var-tmp-cauce-run-538d/
  e66f56fc-….jsonl                          la sesión principal
  e66f56fc-…/workflows/wf_2f5b3e04-a0e.json
  e66f56fc-…/workflows/scripts/autobuild-wf_2f5b3e04-a0e.js   el recorrido tal como corrió
  e66f56fc-…/subagents/workflows/wf_2f5b3e04-a0e/
    journal.jsonl                           51 líneas: started/result por agente
    agent-<agentId>.jsonl                   la transcripción de cada agente
    agent-<agentId>.meta.json               {"agentType":"workflow-subagent","description":"review","workflowPhase":"Review",…}
```

- La carpeta del proyecto es el `cwd` con `/` cambiado por `-`.
- El `journal.jsonl` trae `type`, `key`, `agentId`, `label` y `phase` en `started`. En `result` trae `result` (el objeto
  del schema) y `toolsUsed`, que es la lista de nombres de herramientas sin repetir.
- En la transcripción, cada línea `assistant` trae `message.content[]`, con bloques `tool_use` (`name`, `id`, `input`).
  Cada línea `user` trae `tool_result` (`tool_use_id`, `is_error`). Una denegación se marca con `toolDenialKind`
  (`user-rejected`, `permission-rule`).
- Los `input` que importan acá son `Read{file_path, offset, limit}`, `Grep{pattern, path, output_mode}` y
  `Bash{command, description}`.
- `toolUseResult` no apareció con forma estable en las líneas de resultado: sobre `Read`, nada; sobre un `Bash` fallido,
  una cadena. No se puede contar con él.

### Qué herramientas usó el revisor

| banco | clerk → `files` | `opened` | herramientas de `review` (conteo) |
|---|---|---|---|
| 535  | `[]` | — | Bash 9, Read 2, StructuredOutput 1 |
| 538a | `[]` | — | Bash 11, Read 2, StructuredOutput 1 |
| 538b | `src/sum.js`, `test/sum.test.js` | los dos | Bash 13, Read 2, StructuredOutput 1 |
| 538c | `src/sum.js`, `test/sum.test.js` | los dos | Bash 12, Read 2, Write 6, StructuredOutput 1 |
| 538d | `[]` | — | Bash 11, Grep 1, Read 1, StructuredOutput 2 |
| 533a | `[]` | — | Bash 12, Read 2, StructuredOutput 1 |
| 533b | `src/sum.js`, `test/sum.test.js` | los dos | Bash 15, StructuredOutput 2 |

Lo que se lee en esa tabla:

- **El revisor lee sobre todo por `Bash`, no por `Read`.** De 94 llamadas de lectura entre los siete, 83 son `Bash` y 11 `Read`, y ninguna de esas
  11 es sobre un archivo del diff salvo una (`test/sum.test.js` en 538b). El resto son contratos de cargo y reglas.
  En `Bash` aparecen `git -C … status`, `git -C … diff`, `git -C … show HEAD:src/sum.js`, `cat <app>/test/*`,
  `sed -n`, `head -c`, `npm --prefix … test` y `node -e` con `require()` de la prueba.
- **Muchas llamadas fallan.** Hay `is_error` en 4 a 8 llamadas por revisor, casi todas denegaciones (`user-rejected`).
  Dos patrones: el `cd <dir> && …` de la primera llamada, y las copias de mutación fuera de la carpeta del banco.
- **En 538c el revisor escribió.** Hizo 6 `Write`: tres en `/var/tmp/cauce-run-538c/mut-sum/`, denegados por
  `permission-rule`, y tres en `/tmp/mut-sum/`, que pasaron. Era la copia para una mutación. No es parte de este caso,
  pero un verificador de lo leído tiene que ignorar los `Write`.

### Lo declarado contra lo leído

`probe-opened.js`, sólo sobre las llamadas sin `is_error`:

```
538b: opened=["src/sum.js","test/sum.test.js"]; llamadas exitosas=7
  src/sum.js:       {"git show HEAD:<ruta> (versión anterior)":1,"git diff sin pathspec":1}
  test/sum.test.js: {"git diff sin pathspec":1,"Read literal":1}
538c: opened=["src/sum.js","test/sum.test.js"]; llamadas exitosas=10
  src/sum.js:       {"git diff sin pathspec":1}
  test/sum.test.js: {"git diff sin pathspec":1,"glob test/*":1}
533b: opened=["src/sum.js","test/sum.test.js"]; llamadas exitosas=8
  src/sum.js:       {"git show HEAD:<ruta> (versión anterior)":2,"git diff sin pathspec":1}
  test/sum.test.js: {"glob test/*":1,"git diff sin pathspec":1,"require() desde node -e":2}
```

- **La declaración no mintió en ninguna de las tres.** Cada archivo de `opened` tiene al menos una llamada exitosa que
  muestra su contenido.
- **Pero casi nunca por su nombre.** `src/sum.js` no se abrió nunca como archivo del árbol, en ninguna de las tres
  corridas. Lo que se vio fue su hunk en un `git diff` sin pathspec. El único `git show` que lo nombra, `HEAD:src/sum.js`,
  muestra la versión de **antes** del cambio. `test/sum.test.js` se vio por `Read` literal una vez, y por `cat
  <app>/test/*` dos veces.
- **El `git diff sin pathspec` que la sonda le acredita a `test/sum.test.js` es falso.** En esas corridas la prueba
  estaba sin trackear (el `consulted` de 538c lo dice: `?? test/`), y `git diff` no muestra lo no trackeado. Es
  exactamente el error que cometería un verificador ingenuo.

Un verificador que buscara la ruta literal en `Read` o `cat` habría frenado las tres corridas por `src/sum.js`, y dos de
ellas también por `test/sum.test.js`. Lo hacía con un revisor que sí había mirado.

## Causa raíz

- `opened` y `consulted` son campos del schema que llena el revisor (`autobuild.js:214`, `:263`). El cruce
  (`autobuild.js:1987`) compara esa declaración con la lista del clerk, que tampoco abre nada.
- El recorrido no puede leer la transcripción por su cuenta. «su runtime no lee archivos» (`autobuild.js:1328-1329`), y
  no tiene `require` (`autobuild.js:552`).
- Lo que sí tiene es `clerk` (`autobuild.js:756`): un agente `cauce-clerk` que corre un comando y devuelve lo que
  imprimió.

## Cómo puede el recorrido conseguir la transcripción

- **El workflow solo, no.** No lee archivos (`:1328-1329`). Tampoco consta que `agent()` le devuelva el `agentId`: el
  recorrido no lo usa en ningún lado, y el `result` del journal trae sólo los campos del schema. Que `agent()` no lo
  devuelva es una **hipótesis** que no se comprobó.
- **Un clerk con un comando del motor, sí.** El clerk corre en la misma corrida, y su `Bash` alcanza a
  `$HOME/.claude/projects/`. Para ubicar la carpeta del recorrido el comando necesita tres datos:
  - **La sesión.** **Verificado** en esta sesión, que es un subagente de una sesión interactiva: el `Bash` de un
    subagente trae `CLAUDE_CODE_SESSION_ID`, y existe
    `$HOME/.claude/projects/<cwd>/<ese id>.jsonl` junto a su `<ese id>/subagents/`. Que el agente de un **recorrido**
    lo reciba igual es una **hipótesis**, y se comprueba con un `echo` de presencia en la primera corrida del banco.
  - **El proyecto.** Sale del `cwd` cambiando `/` por `-`. **Verificado** sólo por observación, en los siete bancos.
  - **El recorrido y el agente.** Dentro de `<sesión>/subagents/workflows/`, la carpeta `wf_*` cuyo `journal.jsonl`
    tenga un `started` con `label: "review"` y su `result` ya escrito. De varios, la más reciente. Ahí está el
    `agentId`. También sirve `agent-*.meta.json`, con `description: "review"`.
- **Un hook, también, y es la salida menos frágil.** Los guards reciben `agent_id`, `session_id` y `transcript_path`.
  Eso está **verificado** y escrito en `engine/hooks/confirm.js:45-47`, medido con 2.1.290 y con `agent_type:
  "workflow-subagent"` para el agente de un recorrido, y se usa en `engine/hooks/chat.js:375`. Un `PostToolUse` podría
  anotar por `agent_id` cada `Read`/`Bash` que pasó, y el comando leería esa nota en vez de la transcripción. La entrada
  de un hook es una superficie documentada; el `.jsonl`, no. El costo es que el hook corre en cada llamada de toda la
  sesión, y que el `label` del agente no viene en la entrada (**hipótesis**: no se miró si viene).

## Fix propuesto

**Sólo para Claude Code.** En Codex y Gemini no hay transcripción con esta forma, así que ahí `opened` sigue siendo
declarado y el hecho de revisión lo dice.

1. **`ops review-read <raíz-del-diff> [--label review]`** en el motor.
   - Ubica la transcripción como se dijo arriba y sólo lee.
   - Lista las llamadas exitosas del agente, sin `is_error` ni `toolDenialKind`.
   - Imprime en JSON qué archivos de esa raíz quedaron **leídos**, y de qué forma: `read`, `cat`, `diff`, `glob` o
     `head-only`.
   - Si no encuentra la transcripción, sale con un código propio y una línea que lo dice. Nunca devuelve una lista vacía
     como si nada.
2. **El cruce usa lo medido donde se pudo medir.** Después de Review, un clerk corre el comando.
   - `unopened` pasa a ser `required − leídos`.
   - Si el comando dice «sin transcripción» (otro runner, formato desconocido), se vuelve a `opened`, y el hecho de
     revisión lo dice: `opened declarado, no comprobado`.
   - Si hay transcripción y lo declarado difiere de lo leído, el hecho lo dice, con los dos conjuntos.
3. **Qué cuenta como leído** se escribe en el comando y se prueba con fixtures de transcripción:
   - Cuenta un `Read` de la ruta y un `cat`/`sed`/`head`/`tail` de la ruta o de un glob que la incluya.
   - Cuenta un `git diff` o `git show <hash>` sin pathspec, o con uno que la incluya. Sólo para archivos trackeados, y
     sólo si el diff es el del cambio: un `git show HEAD:<ruta>` muestra la versión anterior y no cuenta.
   - **No cuenta** `Grep` en modo `files_with_matches`, `ls`, `git status`, ni `--stat`/`--name-only`.
   - Un `Grep` en modo `content` sobre la ruta queda como decisión abierta (ver «Tradeoffs»).
4. **Primero medir, después frenar.** Una primera versión sólo anota en el hecho de revisión la diferencia entre
   declarado y leído. Frenar con `review-unbacked` por lo medido se decide con los números de las corridas reales. Es la
   misma secuencia que el 547 eligió para el sello por árbol.

## Tradeoffs

- **Qué es «leído» es una decisión, no un dato.**
  - Un `git diff` sin pathspec muestra el hunk y no el archivo entero. Para un archivo de 2.000 líneas con 3 cambiadas,
    contarlo como leído afirma de más.
  - Un `grep -n` que trae diez líneas es menos que eso.
  - Un `cat <dir>/*` lo muestra entero sin nombrarlo.
  - Lo medido dice que, con la regla estricta (sólo `Read` o `cat` literal), las tres corridas con `opened` habrían
    frenado a un revisor que sí miró. Con la regla laxa, `git diff` cuenta y un revisor que corrió `git diff | head -5`
    también pasa.
- **El formato del `.jsonl` no es una API documentada.**
  - **Verificado** en 2.1.330 sobre siete bancos: la ruta de carpetas, `journal.jsonl` con `label`/`agentId`, `tool_use`
    con `name`/`input` en las líneas `assistant`, `tool_result` con `is_error` y `toolDenialKind`.
  - **No consta** ninguna fuente pública que lo garantice.
  - **Hipótesis**: que se mantenga entre versiones.
  - Por eso el comando tiene que fallar ruidoso ante una forma que no reconoce, y caer a `opened` declarado. Nunca leer
    «no encontré nada» como «no leyó nada», ni al revés.
- **Leer una transcripción la expone.** Tiene el contenido de todo lo que el agente vio, secretos incluidos si los vio.
  El comando tiene que extraer sólo `name` y las rutas del `input`, nunca el `content` de un `tool_result`, y no
  imprimir el `command` entero.
- **`Bash` es texto libre.** Sacar rutas de un `command` es parsear shell: variables (`A=…; cat $A/x`), globs, `cd`,
  subshells. El 464 costó ocho revisiones por leer comandos, y la memoria del proyecto dice no volver a pulir esa lectura
  salvo ante un incidente. Esto es justamente leer comandos. La salida barata es aceptar sólo formas literales y contar
  el resto como «no reconocido», sin frenar por eso.
- **Costo.** Un clerk más por Review, unos 3.450 tokens de entrada según el caso 295 (`autobuild.js:746-748`), más el
  comando, que sólo lee. Con un hook en vez de la transcripción, se paga en cada llamada de la sesión.
- **Es una quita** (R29) cuando pase a frenar: deja de valer lo declarado donde hay transcripción. Se sostiene con la
  salida de antes y la de después sobre las mismas siete transcripciones, que ya están en disco.

## Hallazgo aparte, que sale como caso propio

**El clerk del diff falla abierto.** Tiene peso propio y pide otra decisión, así que va en su propio caso, con número
cuando se escriba.

- En 538a, 538d, 533a y 535, el clerk `review-diff` (`agentType: cauce-clerk`) corrió `cd <banco>/app && git status
  --porcelain --untracked-files=all`, y la llamada se denegó (`toolDenialKind: user-rejected`).
- En 538d, 533a y 535 no reintentó. En 538a reintentó con `git -C` y también se denegó. Las cuatro devolvieron
  `files: []`.
- `DIFFED` no tiene cómo decir «no pude» (`autobuild.js:543-546`). `!diffed` sólo frena si el clerk no devolvió nada
  (`:1980`), así que `required` quedó vacío y el cruce del 485 no corrió.
- El diff no estaba vacío. El `consulted` del revisor de 533a dice `M src/sum.js, ?? test/`.
- En las otras tres corridas el clerk reintentó con `git -C` y sacó la lista bien.

Sale como el caso **552**. Antes de construir este conviene arreglar ese: sin lista del diff, verificar lo leído no tiene contra qué cruzar.

## Prioridad

**Media.**

- **Por qué no es alta.** En lo medido, `opened` nunca mintió. El defecto es de la puerta (R14: un «verificado» que se
  autodeclara), no un daño observado.
- **Por qué no es baja.**
  - El 485 se presentó como el cruce de lo leído contra el diff, y hoy es el cruce de dos declaraciones. Una puerta que
    se presenta más fuerte de lo que es enseña a no creerle al resto.
  - Una instancia real ya construyó el verificador, señal de que alguien lo necesitó.
- **Cuándo sube a alta.** El día que una transcripción muestre un `opened` con un archivo que no aparece en ninguna
  llamada exitosa. Las dos sondas lo miden sin gastar modelo sobre cualquier banco nuevo.
- **Dependencia.** Va después del caso del clerk que falla abierto.

## Contexto de descubrimiento

Ítem 15 de la auditoría del 2026-11-21 sobre una instancia sidecar real. Ésta tenía un verificador propio que reconstruía
de la transcripción del subagente revisor lo que había leído. Se midió acá sobre los siete bancos de `/autobuild` del
2026-11-22, sin correr modelo.

## Relacionados

- 485: introdujo `opened` y el cruce contra la lista del clerk. Este caso dice que el cruce es entre dos declaraciones.
- 464: por qué `opened` es un conjunto y no prosa. Y el costo de leer comandos, que este fix vuelve a tocar.
- 105: `rules`, la misma forma de manifiesto declarado para las reglas.
- 295: el agente `cauce-clerk`, que es por donde el recorrido puede correr el comando.
- 547: «antes se mide», la misma secuencia que el punto 4 del fix.

## Cierre

Se recorrió el caso entero, con la decisión del 2026-11-22: una primera versión que anota y no frena.

- **Fix 1, `ops review-read`**: se hizo, `engine/cli/review-read.js`. Ubica la transcripción por `CLAUDE_CODE_SESSION_ID`
  en el recorrido más nuevo de la sesión, toma los revisores posteriores a la última lista del diff, cuenta sólo las
  llamadas que corrieron y dice de qué forma se leyó cada archivo (`read`, `cat`, `glob`, `diff`). Sin sesión, sin
  transcripción o con una forma que no reconoce, sale con 1 y lo dice, y nunca devuelve una lista vacía como si nada.
  No imprime nada del contenido de la transcripción.
- **Fix 2, el cruce usa lo medido**: se hizo distinto, como pidió la decisión. No reemplaza a `opened` todavía: un clerk
  corre el comando después de Review y el hecho en `done/` dice «la transcripción muestra leído todo el diff», qué no
  muestra leído, o «opened declarado, no comprobado» con el motivo, también cuando el clerk no devuelve nada.
- **Fix 3, qué cuenta como leído**: se hizo con fixtures. Un `git diff`/`git show` cuenta un archivo sólo si su salida
  trae el encabezado de ese archivo: lo que proponía el caso (sin pathspec cuenta todo, sólo trackeados) contaba un diff
  vacío como leído, y lo encontró la revisión. `ls`, `--stat` y `git show HEAD:<ruta>` no cuentan. El `Grep` en modo
  `content` no cuenta: es la decisión abierta, del lado de contar de menos.
- **Fix 4, medir primero**: es esto. Frenar con `review-unbacked` por lo medido queda para cuando haya números.
- **Tradeoffs**: el formato del `.jsonl` está verificado en 2.1.330 y sólo ahí, y una forma desconocida sale como «no se
  encontró»; leer `Bash` se limita a formas literales, y lo demás queda sin reconocer; el costo es un clerk más por
  Review con diff.
- **Hallazgo aparte**: salió como el caso 552.
- **Lo que el enunciado no preveía**:
  - Un recorrido hace varias tareas, y tomar todos los `review` del journal mezclaba al revisor de una con el de otra.
  - Un error de `JSON.parse` cita la línea que no pudo leer, y eso iba a terminar en `done/`. Ya no se incluye.
  - **Anotado sin caso propio**: un `git diff --stat && git log -p` cuenta los encabezados del `log`, y un `git -C
    <otro> show` con la misma ruta relativa también; un diff con rutas entrecomilladas o `diff.noprefix` no se
    reconoce. Los tres son raros, y los dos últimos cuentan de menos.

Lo que se corrió:

- `review-read` sobre las siete transcripciones reales anteriores: coincide con lo que el caso contó a mano —`src/sum.js`
  por su diff, la prueba por `cat test/*` o por `Read`—, y una sesión sin revisor sale `found:false`.
- **Una corrida real de `/autobuild`** en un banco sidecar con el motor del cambio (USD 9,64). El clerk `review-read`
  corrió el comando y su resultado trae `"found":true`: `CLAUDE_CODE_SESSION_ID` le llega al agente de un recorrido, que
  era la hipótesis. El hecho en `done/` dice `· la transcripción muestra leído todo el diff`, y `review-read` corrido
  aparte sobre esa sesión da `{"src/sum.js":"read","test/sum.test.js":"read"}`.
- Las pruebas nuevas contra HEAD: `review-read.test.js` no carga (el comando no existía) y `autobuild-review-coverage`
  tiene 3 en rojo; después, en verde.
- 12 mutaciones en una copia, las 12 rojas.
- Dos pasadas de revisión independiente; la segunda, nada que impida entregar.
- `npm run ci` con los archivos nuevos stageados: 1962 de 1962, exit 0.

**Sin probar:** un revisor que declare en `opened` algo que no leyó, en una corrida real: en las ocho medidas nunca
pasó, y se cubre con fixtures. Y Codex, Gemini o Antigravity, donde el comando dice que no hay transcripción.

### Lista de cierre

1. hecho: las dos sondas sobre las siete transcripciones, con lo que el caso midió en «Síntoma».
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo contra HEAD y en verde después.
4. hecho: 12 mutaciones en una copia, las 12 rojas, con la copia sin mutar en verde.
5. no aplica: agrega una anotación y no quita nada; `opened` sigue decidiendo el cruce como antes.
6. hecho: la corrida real de `/autobuild` y las siete transcripciones reales; se midió que lo anotado coincide con lo leído.
7. hecho: la corrida real de `/autobuild` en Claude Code, USD 9,64; los otros runners quedan en «Sin probar» y el comando lo dice.
8. hecho: la corrida real fue con el motor final del 549; corrieron `found:true` sin nada sin leer y, en pruebas, `found:false` y el clerk sin resultado.
9. hecho: ocho sesiones reales de dos tandas distintas y dos tareas en un mismo recorrido en las fixtures.
10. hecho: dependían el arnés del recorrido y el conteo de rutas de `runners-contract`, que se actualizaron con su razón.
11. hecho: dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
12. hecho: pasada de comentarios sobre el diff entero; se quitaron dos que sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1962 de 1962, exit 0.
14. hecho: este cierre recorre el Fix propuesto, la Decisión, los Tradeoffs y el hallazgo aparte.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
