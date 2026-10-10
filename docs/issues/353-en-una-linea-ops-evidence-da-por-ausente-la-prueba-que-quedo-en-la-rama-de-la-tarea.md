---
caso: 353
titulo: En una línea ops evidence da por ausente la prueba que quedó en la rama de la tarea
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 353 — `ops evidence` busca la prueba en lo que está en disco, y en una línea de trabajo la prueba de una tarea cerrada sólo existe en su rama: todas las trazas salen `[ausente]`

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no rompe nada ni frena nada —`check` no lo usa—, pero vuelve inservible el contraste
justo donde más se trabaja en paralelo. En una línea, toda tarea que `autobuild` cierra queda con sus pruebas
marcadas ausentes, que es la misma respuesta que da una prueba inventada. Un contraste que contesta igual
para lo que existe y para lo que no deja de leerse. Sube a alta si una instancia con líneas reporta haber
descartado una entrega buena por esto.

## Resumen

`ops evidence` contrasta cada traza de `tests:` de una entrada de `done/` contra el producto: busca el
archivo y el nombre de la prueba en los archivos de las raíces declaradas, tal como están en disco.

En una línea de trabajo, `autobuild` construye cada tarea en un árbol propio, la commitea en su rama y
retira el árbol al terminar. La rama queda; el árbol no. Lo que la sesión ve del producto es un enlace al
original, que sigue en su rama de siempre. La prueba recién escrita no está en ningún archivo en disco, así
que el contraste no la encuentra.

No es de las líneas solamente: fuera de una, la respuesta depende de qué rama esté puesta en el producto en
el momento de preguntar. En una línea pasa siempre.

## Reproducción

Con instancia y servicio como carpetas hermanas, que es la disposición habitual:

```bash
node tools/ops.js line . x && cd ../../<carpeta>-x/ops
node tools/ops.js claim planning t-uno
node tools/ops.js worktree planning t-uno --json      # da la ruta del árbol de la tarea
# en ese árbol: escribir test/a.test.js, `git switch -c feat/t-uno`, commitear
# escribir planning/done/t-uno.md con  tests: A → test/a.test.js › «ok devuelve true» — …
node tools/ops.js evidence planning --task t-uno      # con el árbol todavía puesto
git -C <repo del servicio> worktree remove <árbol de la tarea>
node tools/ops.js evidence planning --task t-uno      # con el árbol retirado
```

## Síntoma

Corrido el 2026-10-09 con el motor de la rama, sin modelo. Con el árbol de la tarea todavía en disco:

```
TAREA  t-uno
  A → test/a.test.js › «ok devuelve true» — asercia el valor  [encontrado] — en el archivo: ok devuelve true
```

Con el árbol retirado, que es como lo deja el recorrido:

```
  A → test/a.test.js › «ok devuelve true» — asercia el valor  [ausente]
```

El commit sigue ahí, en la rama `feat/t-uno` del servicio, y `ops check` lo encuentra: pasa sin avisos.

Y en dos corridas reales de `/autobuild` en una línea, con el runner instalado: las cuatro trazas de la tarea
cerrada, `[ausente]`. La sesión lo informó así en la primera —«`ops evidence` marca los cuatro renglones de
tests como ausentes… El archivo de prueba existe y pasa donde lo corrí»—.

## Causa raíz

- `engine/cli/planning.js:54-60` — `evidence` arma las raíces desde `workspaceRoots` y se las pasa a
  `contrast`. No mira el campo `commit:` de la entrada, que nombra el sha y la rama.
- `engine/core/evidence.js:247-262` — `contrast` lista los archivos de esas raíces en disco y busca ahí la
  ruta y el nombre. Lo que no está en el árbol puesto no existe para él.
- `automatization/workflows/autobuild.js:371` — en una línea, el paso de Commit retira el árbol de la tarea
  con `git worktree remove` y deja la rama. Es lo correcto —el árbol es desechable—, y es lo que saca a la
  prueba del disco.

## Fix propuesto

Es una propuesta: que el contraste mire el commit de la entrada cuando el disco no alcanza.

1. La entrada de `done/` ya nombra su commit, y `check` ya sabe encontrarlo en los repositorios declarados
   (`commitFiles`, `commitStatus`). Cuando una traza no aparece en disco, `evidence` busca el archivo en el
   árbol de ese commit —`git show <sha>:<archivo>`— y el nombre de la prueba adentro.
2. La salida dice de dónde salió la respuesta: `[encontrado] — en el commit <sha>`, distinto de «en el
   archivo». Un contraste que encontró algo en un commit que no está en ninguna rama puesta no afirma lo
   mismo que uno que lo vio en disco.
3. Lo que no está ni en disco ni en el commit sigue saliendo `[ausente]`, como hoy.

## Valor

- Devuelve el contraste a quien trabaja con líneas: hoy contesta «ausente» a todo, y la sesión que cierra
  una corrida lo tiene que explicar a mano cada vez.
- Cierra una ambigüedad que también existe sin líneas: la respuesta deja de depender de qué rama esté puesta
  en el producto.

## Qué podría salir mal

1. **Buscar en el commit puede dar por buena una prueba que ya no existe.** Si la rama se reescribió o la
   prueba se borró después, el commit viejo la sigue teniendo. Por eso la salida tiene que decir que la
   encontró en el commit y no en disco.
2. **Un sha que ningún repositorio conoce.** Hoy `check` calla ahí, y `evidence` tendría que seguir diciendo
   `[ausente]`, no inventar un tercer estado.
3. **Varios commits en una entrada.** `commit:` admite varios separados por `;`: hay que mirar todos, y la
   prueba puede estar en cualquiera.
4. **El costo.** Un `git show` por traza que no esté en disco. Es un comando que corre una persona, sobre
   una tarea: no es un camino caliente.

## Riesgo de regresión

Lo que hoy se encuentra en disco se sigue encontrando igual: el commit se mira sólo cuando el disco no
alcanza. Lo que cambia es que algunas trazas que hoy salen `[ausente]` pasan a `[encontrado]`, y eso se
prueba en los dos sentidos: la que está en el commit, y la que no está en ningún lado.

## Recomendación

Hacerlo. Es acotado —un solo comando, de sólo lectura— y arregla una respuesta que hoy es falsa en el uso
normal de una línea. No urge: nada depende de `evidence` para avanzar.

## Tradeoffs

- La alternativa es no retirar el árbol de la tarea, y es peor: los árboles se acumulan, y fue lo que el
  recorrido dejó de hacer a propósito.
- Otra es contrastar contra la rama y no contra el sha. La rama se mueve; el sha es lo que la entrada firmó.
- No está medido cuántas veces alguien corrió `evidence` en una línea y leyó `[ausente]` como un problema.

## Cierre

**Resuelto en 0.106.0.** `ops evidence` recorre el producto enlazado de una línea y, lo que el disco no
tiene, lo busca en el commit que la entrada nombra. La respuesta del commit se usa sólo si mejora la del
disco, y la salida dice de dónde salió.

### Lo que este caso encontró y no preveía

**Eran dos causas, y el enunciado tenía una.** La prueba nueva sólo existe en la rama de la tarea, como decía
el caso. Pero la prueba que ya existía antes de la tarea también salía ausente, y ésa sí está en disco: en
una línea el producto es un enlace, y el recorrido tomaba el enlace por un archivo. El contraste no veía
nada del producto.

### El recorrido de lo que este caso enumeró

- **Fix 1, buscar en el commit de la entrada — se hizo.** Usa el repositorio que la traza nombra en
  `(repo@rama)`, o las raíces que son un repositorio. Con varios commits, cualquiera sirve.
- **Fix 2, decir de dónde salió — se hizo**: `(en el commit <sha>, no en disco)`, en todo veredicto que vino
  de un commit, y el campo `commit` en `--json`.
- **Fix 3, lo que no está en ningún lado sigue ausente — se hizo y se probó.**
- **Qué podría salir mal 1, una prueba que ya no existe — acotado por la nota**, que es lo único que lo
  distingue: un commit viejo que todavía tiene la prueba la da por encontrada, y la salida dice que no está
  en disco.
- **2, un sha que nadie conoce — sigue `[ausente]`**, igual con `n/a` y con un repositorio que no existe.
- **3, varios commits — se miran todos**, y queda el primero que mejora la respuesta.
- **4, el costo — medido**: cuatro procesos de git por commit citado y uno por archivo leído; diez trazas
  con archivo, 15 procesos y 152 ms.
- **Riesgo de regresión, «lo que hoy se encuentra en disco se sigue encontrando igual» — comprobado** por la
  revisión sobre instancias sin enlaces, y por las pruebas que ya había de `evidence`.
- **Tradeoff «contrastar contra la rama y no contra el sha» — se usa el sha**, como se proponía.

### Lo que encontró la revisión independiente

Un subagente revisó el diff con escenarios armados a mano y dieciséis mutaciones. Tres hallazgos impedían
entregar, y dos de ellos daban por encontrada una prueba inventada, que es lo que este contraste existe para
atrapar. Los tres están corregidos con prueba y mutación en rojo:

- **El árbol del commit traía el `planning/` de la instancia.** Cuando la instancia vive en el repositorio
  del producto, la entrada volvía a encontrarse a sí misma por el commit: es el caso 316, por otra puerta.
  Ahora el `planning/` queda fuera del árbol del commit, igual que del disco.
- **Seguir enlaces llevaba al `planning/` por otro nombre.** El recorrido comparaba rutas sin resolver. Ahora
  compara la ruta real y deja afuera todo lo que cuelga de ahí.
- **Un enlace a un árbol enorme colgaba el comando o le hacía perder una prueba que estaba.** Llenaba el
  tope de archivos antes de llegar a la carpeta de pruebas.

**Una segunda pasada, sólo para romper esas tres correcciones, rompió dos.** El `planning/` seguía entrando
por el commit cuando el repositorio se nombraba por un enlace, y por disco con un enlace a una subcarpeta
suya; y un enlace a `/` todavía colgaba el comando, leyendo un dispositivo. Además encontró una regresión
sin ningún enlace: una carpeta con más archivos que el tope dejaba de leerse entera. De ahí salió la forma
final, que es más angosta que la primera:

- **Un enlace se sigue en un solo caso**: cuelga directo de la raíz y lleva a un repositorio. Es lo que arma
  `ops line`. Un enlace a `/`, a `/usr` o a una carpeta cualquiera no se sigue: medido, 0,07 segundos, lo
  mismo que antes del cambio. Cada enlace seguido lleva su propio tope.
- **El `planning/` se excluye por ruta real y con todo lo que tiene adentro**, en disco y en el commit,
  también por un enlace a uno de sus archivos —esto último ya pasaba antes de este caso—.
- **Del commit queda afuera lo mismo que del disco**: `node_modules` y las carpetas que empiezan con punto.
- **De un merge se toma lo que trajo** respecto de su primer padre; antes no listaba nada.
- **El tope de archivos volvió a mirarse como antes**, al entrar a cada carpeta.

Los guiones con que esa pasada lo rompió se volvieron a correr contra la forma final: los veinticuatro
escenarios de autoencuentro dan lo esperado o lo mismo que el motor anterior, y los de enlaces, lo mismo o
mejor, en el mismo tiempo.

Y lo demás, corregido: en un repositorio de decenas de miles de archivos el listado del commit volvía vacío
y el arreglo se apagaba en silencio; un tope de lecturas compartido hacía depender el veredicto del orden de
las trazas —se sacó: una palabra suelta se busca sólo en lo que el commit tocó, y un archivo que la traza
nombra se lee siempre—; la nota del commit faltaba en `parcial` y en las trazas de una palabra; y una traza
que el disco dejaba `inbuscable` porque el archivo no estaba ahora se mira también en el commit.

### Qué se corrió

- **Sobre la corrida real de `/autobuild` que originó el caso**, con el motor nuevo. Antes, las cuatro
  trazas `[ausente]`. Ahora:

  ```
  A → app/test/handler.test.js › «rechaza con 403 el pedido marcado blocked»  [encontrado] … (en el commit 5f84511…, no en disco)
  A → app/test/handler.test.js › «devuelve el cuerpo del pedido»              [encontrado] — en el archivo: devuelve el cuerpo del pedido
  ```

  La prueba nueva sale del commit y la que ya existía, del disco, detrás del enlace. Las dos trazas `n/a`
  encuentran en el commit lo que la tarea agregó al documento y al comentario.
- `test/planning/evidence-commit.test.js` arma con git de verdad la carpeta de una línea, una instancia
  dentro del repositorio del producto, un merge y dos repositorios sin nombrar: trece casos.
- Veinticinco mutaciones, cada una en rojo: nueve sobre la primera versión, ocho tras la primera revisión
  y ocho tras la segunda. Tres sobrevivieron en el camino: dos pedían un caso que faltaba, y la tercera
  sostenía código que no decidía nada y se sacó.
- Lo que cambia respecto del motor anterior en una instancia sin enlaces: una traza que el disco no
  encuentra y el commit sí pasa a `[encontrado]`, marcada. Lo demás da igual, comparado traza por traza
  sobre seis disposiciones.

Lo que queda dicho y no se cambió: una frase citada que trae una palabra entre comillas invertidas se busca
partida y sale «cita y no aparece» aunque esté. Es anterior a este caso y se ve en la corrida real.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Dos observaciones, ninguna de conducta:

- **El sha y el repositorio de un commit citado se extraían en dos lugares**, éste y el aviso de commits
  desconocidos. Ahora hay una sola función y los dos la usan.
- **`sourceFiles` resuelve la ruta real de cada carpeta que recorre** — una llamada al sistema por carpeta.
  No se cambió: lo que se saltea se compara por ruta real, y no se midió que cueste algo que se note.

### Lo que costaba resolver la ruta real, medido (2026-10-09)

Había quedado anotado sin medir. Sobre dos instancias reales, en sólo lectura, buscando una traza que no
existe —el peor caso, recorre todo—: 241 llamadas y 26 ms de 959 ms en una, 621 llamadas y 84 ms de 2.600 ms
en la otra. **Alrededor del 3 % del tiempo.** No se cambia.

La tercera instancia abortó por memoria en esa misma medición, y no por esto: es el caso
[361](./361-evidence-aborta-por-memoria-cuando-una-raiz-tiene-archivos-binarios-grandes.md).

## Contexto de descubrimiento

Corridas reales de `/autobuild` del 2026-10-09, hechas para respaldar los casos de 0.106.0. Apareció junto a
otras tres observaciones y se atribuyó, como ellas, a cómo estaba armado el banco de medición —es el
[352](./352-una-linea-se-queda-sin-el-producto-cuando-su-repo-vive-dentro-de-la-instancia.md)—. Al repetir
la corrida sobre la disposición real las otras tres desaparecieron y ésta no. La primera reproducción a mano
había dado `[encontrado]` porque se corrió antes de retirar el árbol de la tarea.

## Relacionados

- [352](./352-una-linea-se-queda-sin-el-producto-cuando-su-repo-vive-dentro-de-la-instancia.md) — de donde se
  separó.
- [274](./274-en-una-linea-el-recorrido-cambia-de-rama-el-producto-que-comparte.md) — por qué en una línea la
  tarea se construye en un árbol propio.
