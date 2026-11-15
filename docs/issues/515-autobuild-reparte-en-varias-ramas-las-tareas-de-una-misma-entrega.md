---
caso: 515
titulo: En la principal, /autobuild reparte en varias ramas las tareas de una misma entrega, aunque la persona haya cortado la rama del hito
estado: resuelto
resuelto-en: 0.121.0
prioridad: baja
version-detectada: 0.120.0
---

# 515 — En la principal, /autobuild reparte en varias ramas las tareas de una misma entrega, aunque la persona haya cortado la rama del hito

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **baja**: no pierde trabajo y tiene un rodeo —correr `/autobuild
--max 1` de a una tarea—, pero una entrega de varias tareas en una sola corrida termina en una rama por tarea, y
juntarlas es a mano.

## Resumen

Una instancia que entrega por hito —una rama `feat/<entrega>` cortada por la persona, un PR a la rama viva, los
commits son las tareas— corre `/autobuild` sobre ese hito en la principal. La primera tarea commitea en la rama
elegida; desde la segunda, el recorrido la cuenta como «la rama de otra tarea» y corta `<tipo>/<slug>`. El hito sale
repartido en tantas ramas como tareas.

El arreglo del 307 fue correcto para lo que medía: dos tareas sin relación apiladas en la rama de la primera. Lo que no
distingue es una rama que la persona cortó para todo el hito, y que el propio comentario promete respetar («Una rama que
la persona eligió y no es de ninguna tarea se respeta como antes»). Se respeta para la primera tarea y nada más.

## Reproducción

Leída en el código, sin correr `/autobuild`: la corrida cuesta un hito entero y el texto que decide sale literal del
prompt de Commit.

1. En un repositorio de servicio, `git switch -c feat/entrega` desde `main`.
2. Un hito con dos tareas del mismo `service:`, y `/autobuild --hito <hito>`.
3. La primera commitea en `feat/entrega`; `usedBranches` la anota.
4. El prompt de Commit de la segunda trae `feat/entrega` entre «las que esta corrida ya usó», y manda a
   `git switch -c <tipo>/<slug>`.

## Síntoma

El texto que recibe la sesión de Commit de la segunda tarea, armado por `BRANCHED` (la parte que decide):

```
Si el repositorio ya está en una rama que no es viva, commiteá en ésa, salvo que sea la rama de otra tarea: las que
esta corrida ya usó —feat/entrega—, o una cuyo nombre termine en el identificador de una tarea con entrada en
planning/done/. Ahí cortá igual `git switch -c <tipo>/<slug>`, desde donde está
```

**Reproducido con el arnés** el 2026-11-15, sin modelo: `runFlow` de `test/support/autobuild-harness.js` con dos tareas y
la primera commiteando en `feat/entrega`. La corrida cierra las dos (`done: ["T-1","T-2"]`) y el prompt de Commit de la
segunda dice, literal: «salvo que sea la rama de otra tarea: las que esta corrida ya usó —feat/entrega—, … Ahí cortá
igual `git switch -c <tipo>/T-2`». Lo que hace el modelo con eso no se corrió; el 307 midió que lo sigue.

**Rodeo:** `usedBranches` vive dentro de una corrida (`autobuild.js:1034`), así que `/autobuild --max 1` corrido una vez
por tarea deja cada una en la rama donde esté parado el repositorio, si su nombre no termina en el id de una tarea de
`done/`.

## Causa raíz

- `automatization/workflows/autobuild.js:2576`: toda rama donde quedó un commit entra en `usedBranches`, también la que
  ninguna tarea cortó.
- `automatization/workflows/autobuild.js:433`: el prompt trata cualquier rama de `usedBranches` como «la rama de otra
  tarea».
- `automatization/workflows/autobuild.js:418`: en un árbol de línea no pasa (`tree.line` commitea en la rama de la
  línea), así que hoy la única forma de que un hito quede en una rama es abrirle una línea.

## Fix propuesto

**Decisión que pide a la persona:** cuál de las dos.

Que `usedBranches` anote sólo las ramas que cortó el recorrido, no la que ya estaba cuando empezó. Se puede decidir sin
preguntarle a nadie más: el recorrido corta siempre `<tipo>/<slug>`, así que basta con anotar la rama sólo si su nombre
termina en el id de la tarea que acaba de commitear. La prueba del 307 (`autobuild-claim.test.js:361`) sigue en pie,
porque `feat/T-1` termina en `T-1`. Una rama que la persona dejó puesta antes de la corrida sigue siendo de la persona
para todas las tareas, que es lo que promete el comentario de `autobuild.js:416`.

Otra forma, más explícita: que el hito declare su rama, `## Hito slug — Título (rama: feat/entrega)`, y el recorrido
commitee ahí cada tarea de ese hito.

## Revisión (2026-11-15)

- **Citas:** `autobuild.js:2576`, `:433`, `:418` y el comentario de `:416`, contrastadas contra el fuente de la rama
  `fix/e2e-120-findings`: coinciden.
- **Reproducción:** con el arnés, arriba en «Síntoma».
- **Lo que el caso no decía:** el rodeo de `--max 1`, y que la primera forma del fix no necesita estado nuevo.
- **Si vale:** es real y barato de arreglar con la primera forma (un `if` y una prueba). Lo sufre quien corre varias
  tareas de un hito en una sola corrida parado en una rama propia; no pierde trabajo. **Propuesta:** la primera forma, sin
  sintaxis nueva en el BACKLOG. La segunda cambia el formato de `planning/`, que baja a todas las instancias.
- **No es el mismo defecto que el 514**, aunque venga de la misma instancia: allá es el nombre de la rama de una línea y
  la configuración; acá, qué ramas cuenta `/autobuild` como de otra tarea. Se arreglan y se prueban por separado.

## Tradeoffs

- **Vuelve el 307 si se lee mal.** Dos tareas sin relación, con la persona parada en una rama vieja que no es de
  ninguna, terminarían juntas. La versión con la rama declarada en el hito no tiene ese riesgo: lo que no declara
  sigue igual que hoy.
- **El renombre en un árbol de tarea** (`autobuild.js`, rama `task/<slug>` → `<tipo>/<slug>`) no cambia.

## Contexto de descubrimiento

La misma instancia del 514, al escribir que la rama es por entrega y no por tarea. Antes de cambiar su regla se leyó cómo
corta ramas el recorrido, y esto fue lo que no encajaba. Se saneó el nombre de la instancia.

## Relacionados

Caso 307 (las tareas apiladas en la rama de la primera) y caso 514 (la rama de una línea).

## Cierre

Se tomó la primera forma, por decisión de la persona (2026-11-15). En `automatization/workflows/autobuild.js`,
`usedBranches` anota la rama de un commit sólo si su nombre termina en `/<id de la tarea>`, que es como la corta el
recorrido. La rama que la persona dejó puesta para el hito sirve para todas sus tareas.

Línea de base: la sonda con el arnés de la revisión del caso, donde el prompt de Commit de la segunda tarea traía «las
que esta corrida ya usó —feat/entrega—» y mandaba a cortar `<tipo>/T-2`.

Contra el caso:

- **Fix, primera forma:** se hizo.
- **Fix, segunda forma (la rama declarada en el hito):** se decidió que no, por la opción tomada; cambiaba el formato de
  `planning/`.
- **Tradeoff, vuelve el 307 si se lee mal:** se paga, como el caso lo anticipaba. Con el repositorio parado en una rama
  vieja que no es de ninguna tarea de `done/`, dos tareas sin relación se apilan ahí. Lo que el 307 midió —la segunda
  sobre la rama que cortó la primera— sigue cuidado por su prueba, y además por la cláusula de `done/` del prompt.
- **Tradeoff, el renombre en un árbol de tarea:** no cambia; ese camino no lee la lista.

Lo que el caso no preveía, de la revisión independiente: la comparación exacta con el id sobraba (el recorrido siempre
corta `<tipo>/<id>`) y se quitó, y la barra del `endsWith` no tenía prueba; ahora la tiene.

### Lista de cierre

1. hecho: la sonda con el arnés de la revisión del caso, con el prompt de la segunda tarea.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «la rama que eligió la persona sirve para todas las tareas de la corrida», en
   `test/workflows/autobuild-claim.test.js`, en rojo antes del arreglo y en verde después.
4. hecho: mutaciones en rojo en una copia: anotar siempre (la prueba nueva), no anotar nunca (la del 307) y `endsWith`
   sin la barra (la prueba nueva, con `feat/entrega-T-1`). La comparación exacta con el id sobrevivió porque sobraba, y
   se quitó.
5. hecho: lo que se quita es anotar la rama de la persona. La prueba afirma que la segunda tarea ya no la recibe como de
   otra tarea, y la salida de antes y la de después están en «Qué se corrió».
6. hecho: `/autobuild --max 2` real en la instancia embebida de prueba, con el wiring reinstalado desde la rama.
7. hecho: lo que depende del modelo corrió en Claude Code, con `claude -p` (USD 15,69).
8. hecho: corrieron una sola sesión con dos tareas del mismo hito y del mismo servicio. No corrió el camino de dos
   sesiones, donde la lista no interviene (cada sesión de Build hace una tarea).
9. hecho: dos tareas en una misma corrida, que es la condición del defecto.
10. hecho: `usedBranches` se usa sólo en su declaración, en el argumento de `BRANCHED` y en el push; la prueba del 307
    sigue en verde.
11. hecho: una pasada independiente. Halló una línea de 121 caracteres (impedía entregar) y la mutación de la barra; las
    dos se arreglaron.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1812 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

`/autobuild --max 2` sobre el hito `consultas-del-dia` (dos tareas), con el repositorio en `feat/consultas-del-dia`,
cortada a mano antes de la corrida:

```
antes   (sonda) la segunda tarea recibe «las que esta corrida ya usó —feat/entrega—» y corta <tipo>/T-2
después df6cb90 feat(turnos): list a day's active bookings …  (.@feat/consultas-del-dia)
        f19387a feat(turnos): count a day's active bookings    (.@feat/consultas-del-dia)
        ramas: feat/consultas-del-dia y las de antes; ninguna por tarea
```

En esa corrida una mutación de QA corrió sobre el árbol y no sobre una copia. Lo que la frenó fue el permiso de Claude
Code (`mktemp -d /tmp/…` → «This command requires approval»), porque la prueba se lanzó con `--allowedTools` limitado a
`node`, `npm` y `git`; no es de Cauce, y en una sesión con la persona delante se aprueba.

**Sin probar:** el camino de dos sesiones con dos tareas, y una sesión interactiva.

