---
caso: 317
titulo: el guard de límites no resuelve enlaces simbólicos
estado: resuelto
resuelto-en: 0.104.0
prioridad: media
version-detectada: 0.103.5
---

# 317 — Escribir por un enlace que está dentro de una raíz y apunta afuera pasa

**🟢 resuelto en 0.104.0** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: es un hueco en el guard que cuida dónde se escribe. No se vio usado en ninguna corrida.

## Resumen

Los dos guards de límites comparan la ruta como está escrita contra las raíces declaradas. Si dentro de una
raíz hay un enlace simbólico hacia afuera, la ruta escrita cae adentro y la escritura real cae afuera.

## Reproducción

Con los guards reales, una raíz con `enlace -> ../afuera`:

```
echo x > <afuera>/a.js          → FRENA: el comando escribe en …, fuera de las raíces
echo x > enlace/a.js            → PASA
herramienta de archivos, enlace/a.js   → PASA
```

## Causa raíz

`engine/hooks/shell.js` y `engine/hooks/files.js` usan `path.resolve`, que no mira el disco. No hay ningún
`realpath` en `engine/hooks/`.

## Fix propuesto

- Resolver el tramo de la ruta que existe con su ruta real antes de comparar.
- Resolver igual las raíces, o la comparación deja de coincidir donde la raíz misma se alcanza por un enlace.

## Por qué hacerlo

Es anterior a todo lo de esta semana y es un hueco real: un guard de límites que se puede cruzar con un
enlace. La forma habitual de cruzarlo no es maliciosa: es un monorepo con una carpeta enlazada.

## Riesgos y regresiones

**Acá el riesgo es frenar de más**, y es alto si se hace a medias:

- **Enlaces legítimos**: `node_modules` enlazado por el gestor de paquetes, carpetas compartidas de un
  monorepo, y en macOS el temporal, que es un enlace. Todo eso hoy pasa y podría empezar a frenar.
- **El motor enlazado en un banco** del propio toolkit.
- **La ruta que todavía no existe**: hay que resolver hasta el último tramo que sí está.
- **Las líneas de trabajo.** `ops line` es el único lugar del motor que deja enlaces en una instancia: dentro
  de la carpeta de la línea enlaza `node_modules`, las raíces de los servicios y las carpetas hermanas
  (`engine/cli/lines.js`). Quien trabaja en una línea llega a un servicio por un enlace. Si el guard resuelve
  la ruta real y las raíces no, la misma escritura se juzga distinto según se entre por la línea o por la
  carpeta original. Es el riesgo principal de frenar de más y hay que probarlo con una línea armada.
- **Una instancia sin líneas no tiene enlaces propios.** **Verificado** el 2026-10-07 con una instalación
  nueva de 0.103.6 desde npm: fuera de `node_modules`, cero; `.claude/`, `CLAUDE.md` y `AGENTS.md` son
  copias. Los que haya los puso el proyecto, así que cuánto pesa este caso depende de cada instancia.

## Qué habría que probar

- Los tres casos de arriba, y cada enlace legítimo de la lista, con el guard instalado.
- Una línea armada con `ops line`: escribir en un servicio entrando por la línea y por la carpeta original.
- Una instancia real antes de publicar: es donde hay enlaces que un banco no tiene.

## Recomendación

**Hacerlo, pero no en la misma tanda que los demás.** Pide una corrida en una instancia real antes de salir,
porque el modo de fallo es frenar a todos.

## Relacionados

- R23 y R27.

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **Resolver el tramo de la ruta que existe con su ruta real — se hizo, tramo por tramo.** No alcanza con
  resolver la ruta ya juntada: un `..` detrás de un enlace sube desde donde el enlace lleva, y un enlace
  relativo se resuelve contra la carpeta real que lo contiene.
- **Resolver igual las raíces — se hizo.**
- **Enlaces legítimos: `node_modules`, carpetas compartidas, el temporal como enlace — se probaron** y pasan.
  Un `npm link` hacia afuera de las raíces ahora frena: es el efecto buscado y va en el changelog.
- **El motor enlazado en un banco — se probó**: pasa.
- **La ruta que todavía no existe — se hizo**, también detrás de un enlace colgado.
- **Las líneas de trabajo — era el riesgo que se cumplió**, abajo.
- **Los tres casos de la reproducción con el guard instalado — se hizo.**
- **Una línea armada con `ops line` — se hizo**, con la raíz por defecto y con el servicio declarado.
- **Una instancia real antes de publicar — se hizo distinto.** Se le pidió a una instancia real su inventario:
  ningún enlace fuera de `node_modules`, la raíz no es un enlace y no usa líneas. Para ella este cambio no
  mueve nada; el guard nuevo no corrió ahí.

### Lo que este caso encontró y no preveía

- **Una línea sobre un sidecar por defecto quedaba frenada entera.** Con la raíz `..`, `ops line` no enlaza la
  raíz sino sus hijos, así que lo que se escribe en ellos cae en la instancia original, fuera de las raíces de
  la línea. Lo encontró la revisión; el banco de la primera medición declaraba el servicio por su carpeta y
  ahí la raíz misma es el enlace. Ahora, cuando una escritura cae fuera de las raíces del árbol, se le
  pregunta a git de qué instancia salió y vale lo que cae en las raíces de ésa.
- **La aprobación de la persona se alcanzaba por un enlace**: `servicio/x -> planning/.ops-approval`. Se juzga
  también por dónde cae.
- **El temporal se eximía por cómo estaba escrita la ruta.** Un enlace que vive ahí y apunta afuera pasaba.
- **Con `GIT_DIR` en el entorno**, la instancia de origen pasaba a ser la de ese repositorio.
- **La decisión vive ahora en un módulo que comparten los dos guards** (`engine/hooks/boundary.js`).

### Lo que queda como está, y dicho

- **Lo que no se puede ver antes de ejecutar**: un enlace creado y usado en el mismo comando, y un enlace duro.
- **Desde una línea, un enlace propio a cualquier carpeta de la instancia de origen pasa**, también a su
  `.claude/`. Es el precio de que la línea pueda escribir en el producto.
- **Quién es el origen lo dice git, y se le cree.** Reescribir `.git/commondir` lo cambia. Son varios pasos
  deliberados, no un accidente.
- **Sin `git` en el PATH, una línea frena** lo que escribe en el servicio enlazado.
- **Un enlace en el temporal que apunta adentro de una raíz frena**, y el mensaje culpa a la ruta escrita.
- **`test-evidence-shell` y lo que decide si un archivo es del producto** siguen mirando la ruta escrita.
- **Sin cubrir por una prueba**: que las raíces del origen se resuelvan por sus enlaces.

### Qué se corrió

- **Los dos guards instalados, en un banco fuera del temporal**, con un enlace de cada clase, 22 escrituras
  antes y después. Pasan a frenar las nueve que cruzaban:

  ```
  echo x > enlace/a.js                    pasa -> FRENA   escribe en <afuera>/a.js (a donde lleva <raíz>/app/enlace/a.js)
  cd enlace && echo x > a.js              pasa -> FRENA
  cp src/suma.js enlace/b.js              pasa -> FRENA
  echo x > colgado                        pasa -> FRENA   el enlace apunta a algo que no existe
  Write enlace/a.js                       pasa -> FRENA
  ```

  Siguen pasando las once que no cruzan: un enlace interno, `node_modules`, el temporal, la raíz alcanzada
  por un enlace, y una línea de `ops line`.
- **Una línea real sobre el sidecar por defecto**, con los guards instalados: escribir en el servicio, en
  `planning/` y en `node_modules/.cache` pasa; `enlace/a.js` desde la línea frena, por los dos guards.
- **Dos revisiones independientes.** La segunda corrió 133 casos por el punto de entrada real contra el motor
  anterior: ningún freno de más en líneas sobre sidecar y sobre embebido, worktrees, submódulos, pnpm ni
  configuración local por enlace; ningún código de salida que no sea 0 o 2. Midió el costo: git se lanza sólo
  cuando una escritura cae fuera de las raíces del árbol, unos 5,6 ms.
- **20 mutaciones en rojo, en una copia.** Ocho sobrevivieron en algún momento. Cinco tienen ahora su caso:
  el guard de comandos exime el temporal y las pruebas viven ahí, así que se lo corre en otro proceso con el
  temporal apuntado a otra carpeta. Dos eran condiciones inobservables y se sacaron. Una queda sin cubrir, la
  de arriba.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: macOS, donde el temporal es un enlace de verdad, y una instancia real con enlaces.
