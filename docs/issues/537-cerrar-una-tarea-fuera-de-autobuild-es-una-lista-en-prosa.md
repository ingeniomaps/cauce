---
caso: 537
titulo: cerrar una tarea fuera de /autobuild es una lista en prosa de cinco pasos, y no hay comando que la haga
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.1
---

# 537 — cerrar una tarea fuera de /autobuild es una lista en prosa de cinco pasos, y no hay comando que la haga

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **media**: en Claude el recorrido lo hace con un agente; en agy, en
una sesión a mano o en cualquier runner sin el workflow, cerrar es seguir cinco pasos del PROTOCOL sin nada que los
compruebe, y el 463 mostró lo que cuesta uno mal hecho. Dos instancias reales escribieron su propio script para esto.

## Resumen

El paso 13 de `PROTOCOL.md` («Done») son cinco escrituras: sacar la tarea de la cola, escribir `done/<slug>.md`, dejar
el WIP en IDLE, soltar el reclamo y cerrar la épica si no le queda ninguna historia. En `/autobuild` las hace un agente
con un pedido largo. Fuera de él —agy no corre el workflow (caso 431), una sesión manual, otro runner— son una
instrucción, y ninguna de las cinco tiene un comando: `ops` no tiene `done`.

## Reproducción

```bash
node engine/cli/ops.js help | grep -c '^  ops done'      # 0
node engine/cli/ops.js done planning x; echo "exit=$?"   # imprime el uso, exit 2
```

Y lo que cuesta en Claude, medido en la corrida real de `/autobuild` del 2026-11-21 (caso 463, banco `sidecar`, tarea
`lite`): el agente de Done usó **8 herramientas y 326.232 tokens de entrada** para cerrar una tarea, la mayoría
armando y verificando escrituras que no requieren juicio.

## Síntoma

```
0
Uso:
  ops init [destino] [--name <nombre>] [--mode embedded|sidecar] [--force]
  …
exit=2
```

## Causa raíz

No hay mecanismo: Done existe como el paso 13 de `template/planning/PROTOCOL.md:100-104` y como el pedido `done` de
`automatization/workflows/autobuild.js:2489-2547`, que un agente ejecuta. Las piezas que sí son del motor están
sueltas: `ops release` suelta el reclamo (`engine/cli/claims.js:131`), `validateDoneEntry` juzga una entrada
(`engine/planning/done-entry.js:65`), `closedErrors` comprueba que la tarea quedó cerrada con su slug
(`engine/planning/contracts.js`, caso 463). Sacar la tarea de la cola, dejar el WIP en IDLE y cerrar la épica no tienen
función.

## Fix propuesto

`ops done <planning-dir> <tarea> --fields <archivo> [--line <nombre>]`, con lo que juzga quien cierra separado de lo
mecánico, como lo resolvió la instancia:

- **Lo que juzga quien cierra** va en un archivo de campos, una línea `campo: valor` por campo: `done`, `qa`, `tests`,
  `decisions`, `commit`, `review` y `critique`. Un archivo y no argumentos: el texto lleva comillas, flechas y llaves,
  y Claude Code rechaza un comando así antes de ejecutarlo.
- **Lo que se lee del disco** no se pide: `acept` sale de la tarea en la cola, `fecha` del día en la zona del
  proyecto, `lane` del carril de la tarea, `epic` de su línea.
- **Se valida antes de escribir nada**, con `validateDoneEntry`: un campo mal escrito sale con exit 1 y el disco queda
  como estaba.
- **Escribe en orden**: `done/<slug>.md` con la viñeta en el slug de la cola —eso cierra el 463 para el cierre manual—;
  saca la tarea y sus notas indentadas de su archivo de cola, y borra el archivo de `backlog/` si su hito queda vacío;
  cierra la épica (`status: closed`) si no le queda historia fuera de `done/`; deja en `status: IDLE` el WIP del runner
  si apunta a esa tarea; suelta el reclamo con las mismas reglas que `ops release`.
- **Termina comprobando** con `closedErrors` y el resto de `check`: exit 0 si quedó válido.
- **Una segunda corrida no reescribe la evidencia**: si `done/<slug>.md` ya existe, sigue con lo mecánico que falte.
- **No commitea**: imprime qué tocó, para que el commit lo haga quien cierra con las reglas de siempre (stage por
  nombre, rama de planning).

## Tradeoffs

- Es un comando nuevo que escribe en `planning/`, así que tiene que respetar los mismos límites que `release` y `claim`:
  la tarea de otra sesión no se cierra desde ésta salvo que ya esté en `done/` (caso 412).
- El archivo de campos es una forma más que aprender. La alternativa —escribir la entrada a mano y que `ops done` haga
  sólo lo mecánico— pierde la validación antes de escribir y el slug garantizado, que son el punto.
- **Que `/autobuild` lo adopte no entra acá.** Bajaría las 8 herramientas del agente de Done a dos, pero cambia quién
  hace el cierre en el recorrido, y eso es una quita (R29) que pide su propia comparación de antes y después. Sale como
  caso aparte si se decide.
- El PROTOCOL y el pedido de los runners sin workflow tienen que nombrarlo; si no, el comando existe y nadie lo usa.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real: su script de cierre (181 líneas, 8 pruebas, del 2026-11-20)
nació porque cerrar le costaba unas once llamadas al modelo y porque agy no corre el recorrido. La segunda instancia lo
copió. Paso 3 del plan de esa auditoría.

## Relacionados

- 431: agy no corre `/autobuild`; se cerró con una tabla en el PROTOCOL, y fuera de Claude el carril quedó como
  instrucción.
- 463: cerrar con otro slug; `ops done` escribe la viñeta con el slug de la cola y reusa `closedErrors`.
- 412: quién puede soltar el reclamo de una tarea cerrada.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto** — se hizo, con `engine/cli/done.js` (el comando) y `engine/planning/close.js` (las escrituras como
  funciones de texto). Cada viñeta:
  - archivo de campos con lo que juzga quien cierra: hecho; además un campo que no se juzga (`acept`, `fecha`, `lane` o
    un nombre mal escrito) o un renglón suelto frenan, en vez de descartarse callados;
  - lo que se lee del disco: hecho, y distinto en dos puntos que encontró la revisión. `acept` se hereda del texto de
    los criterios cuando la tarea no trae la suya, igual que `context`, y `lane` sale de la cola o de cualquier WIP que
    apunte a la tarea, porque quien cierra suele ser quien revisa y el carril lo anotó quien construyó;
  - se valida antes de escribir: hecho, con la entrada entera y `doneEntryErrors`, que es lo que `check` le pide;
  - escribe en orden: hecho. La viñeta lleva el slug de la cola. Sólo saca la línea que la cola lee (dentro de un
    `## Hito`, fuera de un comentario) y conserva un comentario que esa línea abre. No borra un `backlog/<hito>.md` que
    guarda borradores comentados. Sólo dice ✓ de un frontmatter que de verdad cambió. El reclamo se suelta distinto de
    como lo pedía el caso («con las mismas reglas que `ops release`»): ver el tradeoff siguiente;
  - termina comprobando con `closedErrors`: hecho, corre `check --closed <tarea>`;
  - una segunda corrida no reescribe la evidencia: hecho;
  - no commitea: hecho; lo dice al terminar.
- **Tradeoffs: los límites de `release` y `claim`** — se hizo distinto, con la razón. El caso pedía que la tarea de
  otra **sesión** no se cerrara desde ésta salvo que ya estuviera en `done/`. Aplicado así, `ops done` se negaría en el
  camino normal del paso 12: una sesión construye y **otra** revisa y hace Done, y en ese momento la tarea todavía no
  está en `done/`, porque escribirla ahí es justamente lo que hace el comando. Lo que se hizo:
  - la tarea de otra **línea** no se cierra desde ésta (como `claim`, caso 239);
  - el reclamo se borra después de escribir la entrada, sin mirar de quién es: a partir de ahí la tarea está en
    `done/`, y desde el caso 412 cualquier sesión puede soltar el reclamo de una tarea cerrada;
  - el WIP de otra sesión que apunta a la tarea no se toca: se avisa.

  Lo que queda abierto: una sesión puede cerrar una tarea que otra sesión de **la misma línea** todavía está
  construyendo. Ninguna prueba ejerce un reclamo ajeno. La validación de la entrada (commit, tests, review) pide
  evidencia que quien no construyó no tiene, pero eso no es un candado. Se anota acá; no se abre caso sin un incidente
  (memoria del proyecto: no abrir casos por cualquier cosa).
- **Tradeoffs: el archivo de campos** — se mantuvo: la validación antes de escribir y el slug garantizado son el punto.
- **Tradeoffs: que `/autobuild` lo adopte** — no entra, como decía el caso; salió como caso propio, el 538.
- **Tradeoffs: el PROTOCOL tiene que nombrarlo** — hecho: el paso 13 lo nombra, con `--line` y qué sale del disco. El
  comando de Gemini y el skill de Codex y Antigravity mandan a leer el PROTOCOL entero y «hacer Done», así que les llega
  por ahí. Que un agente lo use de verdad se midió con dos sesiones reales, abajo: las dos lo usaron sin que se lo
  nombraran.
- **Resumen y Prioridad** — el cierre fuera del recorrido deja de ser una lista sin comprobación; la prioridad no traía
  condición de escalada.
- **Lo que el enunciado no preveía** — que la aceptación heredada y el carril de otra sesión dejaban la entrada mal sin
  que nada avisara; que una cola real trae comentarios, borradores y el hito de ejemplo del molde; y que el encabezado
  de `engine/cli/claims.js` afirmaba que ningún comando toca la cola, que se corrigió. Y que el comando exigía
  `decisions:`, que el PROTOCOL deja opcional: la primera sesión real chocó con eso y la rellenó con evidencia que no
  era una decisión. Ahora no se pide, la entrada sin ella no lleva la línea (tampoco con sólo espacios), el paso 13 y
  `done/README.md` lo dicen, y el rechazo de `check` por una `decisions` sin cita agrega que, si no hubo, la línea no va.

Lo que se corrió:

- Línea de base (0.123.1), en «Síntoma»: `ops done` no existe, exit 2. En la corrida real de `/autobuild` del caso 463,
  el agente de Done usó 8 herramientas y 326.232 tokens de entrada.
- Pruebas nuevas, `test/planning/close.test.js` y `test/planning/done-command.test.js`: 14 pass. El rojo previo: el
  módulo inexistente (`Cannot find module`) y, para las que llegaron con la revisión, seis pruebas en rojo contra el
  código del índice antes de los arreglos, y la del comentario al final de la línea y la del comentario que abre, en rojo
  antes de su arreglo. Las de `decisions` opcional, tres en rojo contra el código anterior (`faltan campos:
  decisions`) y verdes después.
- 26 mutaciones en una copia (`git ls-files -co --exclude-standard`), las 26 rojas y la copia sin mutar verde: comando
  sin registrar, sin validar, sin pedir campos, aceptando campos ajenos o renglones sueltos, sin heredar la aceptación,
  sin el carril de otra sesión, sin sacar la tarea, sin borrar el hito vacío, borrando el hito con borradores, cerrando
  la épica con historias abiertas, sin cerrarla, sin IDLE, sin soltar el reclamo, reescribiendo la evidencia, cerrando la
  tarea de otra línea, dejando las notas, borrando fuera de un hito, sin ver la tarea con comentario al final, borrando la
  apertura de un comentario, cambiando sólo el primer `status:`, rechazando la cerca con espacios, y los campos pisando
  lo leído del disco; y las tres de `decisions`: volver a exigirla, escribirla vacía y escribirla con sólo espacios.
  Dos sobrevivieron en el camino y se contestaron: una por un caso que faltaba (un borrador
  comentado dentro de un hito real), otra porque lo mutado sobraba (`if (opened)`), que se quitó.
- Prueba real sin modelo, repetida sobre la versión final (la primera fue anterior a `decisions` opcional): banco
  `sidecar` copiado fuera del árbol, motor congelado, tarea reclamada con su WIP y su épica, y
  `node tools/ops.js done planning sumar-dos-numeros --fields ../campos.txt` desde la instancia, con el archivo de
  campos sin `decisions`. Salida: `✓ done/sumar-dos-numeros.md`, `✓ backlog/sumas.md (borrado: su hito quedó sin tareas)`, `✓
  roadmap/epic-001-sumas.md (cerrada)`, el WIP en `status: IDLE`, `✓ claims/sumar-dos-numeros.md (reclamo soltado)` y
  `✓ planning válido: 1 épica(s), 0 tarea(s) en cola, 1 terminada(s)`, exit 0. La entrada salió sin la línea
  `decisions:`. `check` deja dos avisos que son del banco, no del comando: la revisión declarada `n/a` en un carril que
  convoca revisor, y el commit de `app` que ninguna entrada nombra (OPS-001). Repetido: `ya tiene su entrada en done/;
  no se reescribe`, exit 0.
- Dos sesiones reales con modelo (`claude -p`, Claude Code 2.1.330, `--permission-mode acceptEdits`) en un banco
  `sidecar` fuera del árbol con el motor congelado y Claude instalado (`automation install`), con el código construido
  y commiteado en `../app`. El pedido no nombraba el comando: «La tarea sumar-dos-numeros ya está construida y
  revisada: el código es el commit <sha> de app/ y `node --test` en app/ pasa. Cerrala.» Contrastadas contra su
  `.jsonl` y el disco:
  - **Primera** (USD 0,52, 12 turnos), sobre el código anterior a `decisions` opcional: leyó el paso 13, corrió
    `ops done` sin `decisions` y recibió `No se escribió nada: ✗ faltan campos: decisions`, con `check` verde y el disco
    intacto; agregó `decisions: [fuente: node --test en app/ exit 0; …]` —evidencia, no una decisión— y cerró. Ninguna
    edición a mano en `planning/`. De ahí salió el arreglo de `decisions`.
  - **Segunda** (USD 0,65, 18 turnos), sobre la versión final: corrió `ops done` sin `decisions`; el primer intento lo
    frenó la validación por el formato de `commit:`, sin escribir nada; corrigió el campo y cerró: `✓ done/…`, hito
    borrado, épica cerrada, WIP en IDLE, reclamo soltado, `check` verde. La entrada salió sin línea `decisions:`. Después
    commiteó el estado con `/commit` en una rama de trabajo, porque el guard le frenó el commit en la rama viva.
- `npm run ci` con todo stageado, incluido el caso 538: 1869 pass, 0 fail, exit 0. Al menos cinco corridas intermedias salieron en rojo, y se arreglaron: un export sin uso, una razón repetida entre un comentario y su prueba, y un borrado recursivo en una prueba
  que no usaba `discard` (en tres corridas seguidas); los pisos de cobertura de los archivos nuevos; y los puntos 7 y 16
  de esta lista, que seguían pendientes.

**Sin probar:** el paso que el comando no hace por diseño —commitear— y `--line` desde una sesión de línea real con su
árbol; el rechazo por línea sí tiene prueba.

### Lista de cierre

1. hecho: la reproducción de «Síntoma» sobre 0.123.1 y la medición del agente de Done de la corrida real del 463.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas se vieron en rojo antes de cada arreglo (módulo inexistente, seis contra el índice, dos de comentarios, tres de `decisions`) y en verde después, 14 pass.
4. hecho: 26 mutaciones en una copia, las 26 rojas; las dos que sobrevivieron en el camino se contestaron con un caso o quitando lo que sobraba.
5. hecho: el cambio reemplaza en `engine/cli/claims.js` la afirmación de que ningún comando toca la cola. Lo que se quita del disco (la línea, el hito, el reclamo) tiene su aserción de ausencia, vista en rojo con sus mutaciones.
6. hecho: banco real fuera del árbol, sin dobles; se midió que la tarea, el hito y el reclamo ya no están y que la épica y el WIP cambiaron de estado.
7. hecho: dos sesiones reales de Claude (`claude -p`, 2.1.330) cerraron la tarea y las dos usaron `ops done` sin que el pedido lo nombrara: lo encontraron en el paso 13 del PROTOCOL y en la ayuda del CLI, contrastado contra su `.jsonl` y el disco; la primera encontró la exigencia de `decisions`, arreglada.
8. hecho: «Lo que se corrió» enumera los caminos. Las mutaciones y el banco sin modelo se repitieron sobre la versión final; el banco anterior a `decisions` opcional se rehízo. La segunda sesión real usó un motor que difiere del final sólo en recortar espacios de `decisions`, retoque que tiene su mutación en rojo y no toca el camino que la sesión ejerció.
9. hecho: dos sesiones distintas probadas (el carril del WIP de otra sesión, el WIP ajeno que no se toca), dos raíces de cola (`BACKLOG.md` y `backlog/`) y una línea ajena.
10. hecho: dependían de la descripción del cierre el paso 13 del PROTOCOL, el comando de Gemini y el skill de Codex y Antigravity (los dos remiten al PROTOCOL) y el encabezado de `claims.js`, corregido.
11. hecho: revisión independiente en cuatro pasadas. La primera halló dos defectos que impedían entregar y cinco menores, todos arreglados. La segunda halló que un arreglo rompía la tarea con comentario en línea, arreglado. La tercera no halló nada que impida entregar, y su borde (el comentario que la línea abre) se arregló igual. La cuarta, sobre `decisions` opcional, no halló nada que impida entregar; sus tres opcionales (recortar espacios, decirlo en `done/README.md` y en el rechazo de `check`) se hicieron.
12. hecho: pasada de comentarios; se quitó la razón repetida entre `done.js` y `close.js`, dos comentarios de prueba que copiaban la del código, y el mensaje de la prueba de `decisions`, que repetía el comentario de `OPTIONAL`.
13. hecho: `npm run ci` con todo stageado, exit 0 (el número, en «Lo que se corrió»).
14. hecho: este cierre recorre Fix propuesto, Tradeoffs, Resumen, Prioridad y lo que el enunciado no preveía.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entradas en el CHANGELOG de 0.124.0 («Agregado» y «Corregido»).
