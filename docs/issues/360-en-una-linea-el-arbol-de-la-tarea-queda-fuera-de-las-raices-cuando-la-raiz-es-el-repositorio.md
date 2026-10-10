---
caso: 360
titulo: en una línea, el árbol de la tarea queda fuera de las raíces cuando la raíz es el repositorio
estado: resuelto
resuelto-en: 0.106.0
prioridad: alta
version-detectada: 0.105.0
---

# 360 — En una línea de trabajo, con una raíz declarada por repositorio, `ops worktree` arma el árbol de la tarea al lado de la raíz y el guard de archivos rechaza la primera escritura: Build frena siempre

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **alta**.

**Prioridad alta**: con esa disposición ninguna tarea se construye en una línea. La corrida gasta Triage,
Ready, Plan y WIP, y frena en la primera escritura de Build pidiéndole a una persona que exima una ruta que
el propio recorrido creó. Y la exención vale para esa tarea sola: la siguiente frena igual.

## Resumen

En una línea de trabajo, `autobuild` construye cada tarea en un árbol propio que arma `ops worktree`. Ese
árbol se crea **al lado** del repositorio del servicio: `<carpeta>/<repo>-<tarea>`.

El guard de archivos deja escribir en la instancia, en las raíces declaradas en `workspaceRoots`, en lo
declarado en `writableOutsideRoots` y en el scratchpad de la sesión. Cuando la raíz es la carpeta que
contiene a los repositorios —`..`—, el árbol de la tarea cae adentro y todo anda. Cuando hay **una raíz por
repositorio** —`../app`—, el árbol de la tarea es hermano de la raíz y queda afuera de todo.

Una raíz por repositorio no es una rareza: es lo que declara una instancia cuyos repositorios no comparten
carpeta con otras cosas, y es la forma que el banco `sidecar` tiene desde el 352.

## Reproducción

Instancia sidecar con `workspaceRoots: [{ name: app, path: ../app }]`, un hito con `line: auth` y el runner
instalado. `ops line . auth`, y `/autobuild` desde la carpeta de la línea.

## Síntoma

De una corrida real de `/autobuild`, el 2026-10-09, con el motor de la rama en `4b321f71`:

```
Triage > Claim > Classify > Worktree > Ready > Plan > WIP > Build > planning-block

Worktree  ok: true · path: …/e2e4-auth/app-restar-dos · repo: …/e2e4/app
Build     completed: false — al primer Edit sobre …/e2e4-auth/app-restar-dos/test/sumar.test.js, guard-files
          lo bloqueó: «está fuera de las raíces declaradas en ops.config.json … declaralo en
          writableOutsideRoots»
parada    blocked-on-human · planning/human/restar-dos.md
```

Unos 520.000 tokens en once agentes para llegar al bloqueo. Declarada la ruta a mano en
`ops.config.local.json`, la misma tarea corrió entera hasta Done y el checkpoint.

## Causa raíz

- `engine/cli/worktree.js`, `worktree` — el destino es `path.join(path.dirname(anchor),
  `${path.basename(anchor)}-${slug}`)`: hermano del repositorio.
- `engine/hooks/input.js`, `writableRoots` — la lista de lo escribible no conoce los árboles de tarea.

Ninguno de los dos archivos cambió en la rama donde se encontró: el defecto es anterior. Lo destapó el
banco `sidecar` nuevo, que declara la raíz como el repositorio; las corridas reales anteriores usaban la
raíz `..` y por eso pasaban.

## Fix propuesto

Que el árbol de una tarea sea escribible por lo que es y no por dónde cae: el guard da por escribible un
worktree **registrado** del repositorio de una raíz declarada —`git worktree list` del repositorio de cada
raíz—, igual que da por escribible la raíz. No se cambia dónde se arma el árbol.

## Valor

Alto para quien usa líneas con una raíz por repositorio: hoy no puede construir ninguna tarea ahí. Nulo
para el resto.

## Qué podría salir mal

1. **Abrir de más.** Un worktree registrado es de ese repositorio y lo creó git; lo que no se puede abrir es
   cualquier carpeta con ese nombre. Hay que preguntarle a git, no comparar nombres.
2. **El costo en cada escritura.** El guard corre antes de cada edición; un `git worktree list` por raíz en
   cada una se nota. Hay que medirlo, y preguntar sólo cuando la ruta ya quedó afuera de todo lo demás.
3. **El guard de shell y el de archivos tienen que contestar lo mismo.** `writableRoots` es de los dos a
   propósito; el cambio va ahí y no en uno.

## Cierre

**Resuelto en 0.106.0** con el fix propuesto.

### El recorrido de lo que este caso enumeró

- **Fix, escribible por lo que es — se hizo.** El guard da por escribible el árbol que git registró en el
  repositorio de una raíz declarada. No cambió dónde se arma el árbol.
- **Qué podría salir mal 1, abrir de más — acotado y probado.** La carpeta tiene que estar en el registro
  del repositorio y apuntar de vuelta a su entrada. Quedan cerradas, cada una con su caso: la carpeta vecina
  con el nombre justo, la que trae un `.git` escrito a mano, la que apareció donde estaba un árbol movido,
  el árbol movido, el retirado, y el de un repositorio que nadie declaró.
- **2, el costo en cada escritura — medido, y se hizo distinto.** No se le pregunta a git: se lee su
  registro, que son un par de archivos chicos por árbol. Sobre tres instancias reales, entre 0,01 y 0,16 ms
  por llamada, con una, tres y seis raíces. Por eso no hizo falta preguntar sólo cuando la ruta ya quedó
  afuera.
- **3, los dos guards contestan lo mismo — se respetó**: el cambio vive en `writableRoots`.

### Lo que este caso encontró y no preveía

- **El árbol de una línea de trabajo no se abre.** También es un árbol registrado, pero es la instancia de
  otra sesión. Se reconoce por su rama y queda afuera.
- **El guard de comandos no frena lo que cae en el temporal del sistema**, así que en una prueba —que vive
  ahí— sólo el de archivos puede mostrar una negativa. En la corrida real también: frenó el `Edit`, no un
  comando.
- **Renombrar la rama del árbol no lo cierra**: el recorrido la renombra al commitear, y lo que decide es el
  registro, no el nombre.

### Qué se corrió

- **La corrida real que frenaba, repetida sobre un banco nuevo y sin eximir nada a mano:**

  ```
  Triage > Claim > Classify > Worktree > Ready > Plan > WIP > Build > Review > Verify > QA > Commit > Done
    > Closing|human-checkpoint > Closing|checkpoint-held

  Build            completed: true, con su prueba en rojo primero
  checkpoint-held  blocked: awaiting-review · checkpoints: ["checkpoints/auth-uno.md"]
  ```

  No existe `ops.config.local.json` en el banco, no quedó ninguna acción humana, y `check` pasa.
- Rojo previo: la prueba nueva de `test/hooks/task-tree-boundary.test.js`, con el mensaje del síntoma.
- Cuatro mutaciones, cada una en rojo: sin sumar los árboles a lo escribible, sin el puntero de vuelta,
  aceptando un `.git` que apunta a cualquier lado, y abriendo el árbol de una línea. La tercera sobrevivió la
  primera vez: no había una carpeta con un `.git` que apuntara a otro lado. Se agregó y se puso en rojo.

No tuvo revisión independiente.

### Lo que encontró la segunda revisión del conjunto (2026-10-09)

La primera versión de este arreglo abría de más, y la revisión lo encontró en tres lugares. Los tres se
corrigieron con prueba y mutación en rojo, y **el arreglo cambió de forma**: ya no alcanza con que git tenga
registrado el árbol.

- **Cualquier árbol registrado se abría**, también el que un comando arma con `git worktree add <ruta>` en
  cualquier lado: el límite se podía ensanchar sin pasar por la configuración. Ahora sólo se abre el que armó
  `ops worktree`, que lo marca en la entrada que git le lleva, al crearlo y al retomarlo. Sin marca, cerrado.
- **El árbol de una línea se reconocía por su rama**, y con la rama renombrada, o sin rama en medio de un
  rebase, pasaba por árbol de tarea: una sesión podía escribir en la instancia de otra. Con la marca deja de
  depender de la rama, en los dos sentidos.
- **Con la raíz en una carpeta del repositorio se abría el árbol entero**, incluido lo que en el árbol
  principal no es escribible. Ahora se abre la misma carpeta que la raíz.

Y dos más:

- **El registro con rutas relativas** —`worktree.useRelativePaths`— no se leía, y el guard volvía a frenar la
  primera escritura. Se resuelve desde la entrada.
- **El guard que frena borrar una prueba commiteada no conocía el árbol de la tarea**: borrarla ahí pasaba
  callado y la misma en la raíz se frenaba. Ahora lo conoce. **El que frena un borrado recursivo de una raíz
  no se tocó**: tampoco cuidaba el árbol de la tarea cuando caía dentro de una raíz contenedora, así que no
  es algo que este arreglo haya quitado.

**Vuelta a correr de verdad** con esta forma, sobre un banco nuevo y sin eximir nada: de Triage al checkpoint,
`Build completed: true`. Siete mutaciones del guard en rojo; la que deja marcar a una carpeta impostora
sobrevivió la primera vez por falta de caso, y se agregó.

Lo que cambia para quien ya tenía árboles de tarea armados: no traen la marca y siguen cerrados hasta que el
recorrido los retoma, que es cuando `ops worktree` se la pone.

### Lo que encontró la tercera revisión (2026-10-09)

Acotada a las correcciones de la segunda. Cuatro hallazgos sobre el guard, los cuatro corregidos con prueba y
mutación en rojo:

- **La marca se podía escribir a mano.** Vive adentro del repositorio, que es escribible, así que abrir un
  árbol era escribir un archivo. Ahora los dos guards de límites frenan a quien la escriba que no sea
  `ops worktree`, también en el temporal, que el de comandos deja pasar para todo lo demás.
- **Mover el árbol con `git worktree move` lo dejaba abierto en el lugar nuevo**, fuera donde fuera, y el
  encabezado decía lo contrario. La marca era su sola presencia. Ahora dice dónde estaba el árbol cuando se
  puso y vale sólo ahí, hasta que `ops worktree` lo retome.
- **En una instancia embebida con la raíz en una carpeta, el árbol de la tarea abría menos que el principal**:
  la segunda versión lo había acotado a la carpeta, y en el principal la instancia entera es escribible.
  Ahora cada carpeta escribible —la instancia y cada raíz— se abre en el árbol en su mismo lugar.
- **`ops worktree` daba por bueno un árbol que no había podido marcar.** Ahora lo dice, y lo lleva en
  `--json`. Pasa con la rama de la tarea puesta en el checkout principal, que no tiene entrada en el registro.

Y uno de costo: el guard de pruebas borradas armaba la lista de árboles en cada comando; ahora primero mira
si el comando borra algo. La lista la arman igual los dos guards, desde un solo lugar.

Lo que sigue siendo cierto y no se cambió: un árbol marcado sigue escribible hasta que se retira, aunque su
tarea ya haya cerrado. El recorrido lo retira al commitear; atarlo a una tarea viva pediría leer el planning
antes de cada escritura.

**Tercera corrida real**, con esta forma: de Triage al checkpoint sobre un banco nuevo, sin eximir nada,
`Build completed: true`.

### Lo que encontró la cuarta revisión (2026-10-09)

Acotada al guard. Encontró que la marca seguía siendo falsificable, y no por un descuido que se arreglara
con otro parche: vive adentro de `.git`, que es escribible, y un guard ve el destino que un comando nombra,
no el archivo que deja caer —`cp <algo> <entrada>/`, `tar -C`, un script—. También que mover el árbol y
retomarlo lo «blanqueaba» en cualquier lado, que detrás de un enlace el árbol quedaba cerrado, y que con el
nombre en mayúsculas pasaba en los sistemas de archivos que no las distinguen.

**El arreglo cambió de forma por tercera vez, y esta vez dejó de anotar.** Qué es un árbol de tarea se
calcula: es la carpeta `<repositorio>-<tarea>`, al lado del repositorio de algo que el proyecto declaró, para
una tarea que hoy tiene un reclamo, y que git tiene registrada como árbol de ese mismo repositorio. No hay
marca, ni rama que mirar, ni archivo que alcance con escribir.

- **El lugar es uno solo**, el mismo que arma `ops worktree`, y lo calculan los dos con la misma función. Un
  árbol registrado en otro lado no se abre; y `ops worktree` se niega a entregar el de esa rama si está en
  otro lado, diciendo cómo moverlo.
- **La tarea está viva.** Sin reclamo el árbol está cerrado, y al soltarse la tarea se cierra solo, que es lo
  que la versión anterior dejaba dicho como límite.
- **La ruta se arma como la ve la sesión**, sin resolver enlaces.

Lo que queda, dicho como es: quien escriba un reclamo a mano y registre un árbol en `<repositorio>-<nombre>`
abre esa carpeta. Es un lugar acotado —hermano del repositorio, con su nombre adelante— y son dos pasos
deliberados; un reclamo de una tarea que no existe lo marca `check`.

**Cuarta corrida real**, con esta forma: de Triage al checkpoint sobre un banco nuevo, sin eximir nada. Al
terminar no queda ningún reclamo, así que el árbol queda cerrado. Trece mutaciones en rojo.

### Lo que encontró la quinta revisión (2026-10-09)

Acotada al guard y a `ops worktree`, con el historial de las cuatro versiones a la vista. Devolvió seis
hallazgos y una lista de lo que comprobó sin encontrar nada: nombres de tarea raros, un `.git` corrupto, y
las disposiciones principales. Los seis se corrigieron con prueba y mutación en rojo:

- **Un enlace puesto en el lugar justo abría adonde llevara**: el agujero de la primera versión con un paso
  más. Ahora un enlace en ese lugar no es el árbol, para el guard ni para `ops worktree`.
- **Con la raíz enlazada a una carpeta de adentro de un repositorio**, el guard subía por la ruta escrita y
  no llegaba al repositorio, mientras `ops worktree` armaba el árbol junto al de verdad: quedaba cerrado.
  Ahora los dos eligen igual: el repositorio más cercano a donde la carpeta está de verdad, nombrado como lo
  ve la sesión cuando por ahí se llega al mismo.
- **`ops worktree` se rompía con un árbol borrado a mano**, que git sigue listando hasta que se poda. Ahora
  lo poda y lo arma de nuevo.
- **Se negaba a entregar el checkout principal con la rama puesta** cuando la raíz era una carpeta suya, y
  proponía moverlo, que git no deja. Ahora el repositorio mismo siempre vale.
- **Una raíz declarada que no está en esta máquina rompía el comando.** Ya no.
- **Una raíz vecina con el nombre parecido se tomaba por el repositorio del servicio**, por comparar el
  comienzo del texto: es anterior a este caso, y `work` mandaba a trabajar a esa otra carpeta.

**Lo que este hallazgo destapó en la máquina**: hay un `/tmp/.git` vacío, y subir por la ruta lo tomaba por
repositorio. Es la razón por la que el repositorio se elige desde la ruta real y no desde el primero que
aparezca.

**Quinta corrida real**, con esta forma: de Triage al checkpoint sobre un banco nuevo, sin eximir nada. Ocho
mutaciones en rojo; una sobrevivió la primera vez por falta de caso, y se agregó.

### Lo que encontró la sexta revisión (2026-10-09)

Con el mismo alcance que la quinta. Cinco hallazgos, y dijo de cada uno si lo reprodujo o lo leyó. Cuatro se
corrigieron con prueba y mutación en rojo; uno se decidió que no.

- **Una tarea que se llame como una línea abría la carpeta de la línea** (reproducido). En una instancia
  embebida esa carpeta es `<repositorio>-<línea>` y es un árbol del mismo repositorio: el lugar y el registro
  coinciden con los de una tarea. Ahora no se abre si el repositorio tiene una línea con ese nombre, y se
  pregunta por la rama de la línea —que existe mientras la línea exista—, no por la rama en la que está su
  árbol.
- **Con un enlace en el camino a la instancia, `ops worktree` entregaba la ruta real y el guard abría sólo
  la que ve la sesión** (reproducido): el árbol que el comando imprimía no era escribible. Ahora se abre por
  las dos, que son la misma carpeta.
- **Una raíz que se llama como el servicio y no está en la máquina rompía `ops worktree`** (reproducido; ya
  pasaba antes de esta rama). Ya no.
- **`git worktree prune` le quitaba el registro a todo árbol ausente del repositorio**, no sólo al de la
  tarea (leído). Ahora se retira ése solo. `ops line` hacía lo mismo desde antes, y también se acotó.
- **`work` y lo que abre el guard apuntan a carpetas distintas cuando el servicio es un enlace hacia otra
  carpeta del mismo repositorio** (reproducido) — **se decidió que no.** Es una raíz que es una carpeta de
  enlaces hacia adentro del propio repositorio; ahí tampoco el árbol principal deja escribir por el enlace,
  porque lo que se escribe cae fuera de la raíz. El guard hace en el árbol de la tarea lo mismo que en el
  principal, y arreglar uno solo los dejaría distintos.

Lo que revisó sin encontrar nada: rutas fuera de `<repositorio>-<tarea>`, excepciones que tumben el hook, y
la coincidencia entre el guard y `ops worktree` con un repositorio bare, un submódulo y un enlace hacia otro
repositorio.

**Sexta corrida real**, con esta forma: de Triage al checkpoint sobre un banco nuevo, sin eximir nada. Seis
mutaciones en rojo; una sobrevivió la primera vez por falta de caso, y se agregó.

## Contexto de descubrimiento

Corrida real de `/autobuild` para comprobar de punta a punta el checkpoint de un hito en una línea, sobre el
banco `sidecar` con la forma que le dio el 352.

## Relacionados

- **274** — el árbol por tarea en una línea.
- **352** — el banco con una raíz por repositorio, que es lo que lo destapó.
- **089** y **090** — `writableOutsideRoots`, la salida que había que usar a mano.
