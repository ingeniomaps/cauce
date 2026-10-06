---
caso: 297
titulo: el reclamo no recibe el pedido y no puede declinar
estado: resuelto
resuelto-en: 0.103.4
prioridad: media
version-detectada: 0.103.3
---

# 297 — «Sólo esta tarea» reclama igual la siguiente, la planifica y frena en Build

**🟢 resuelto en 0.103.4** · detectado en 0.103.3 · prioridad **media**.

**Prioridad media**: lo pedido queda bien hecho. Lo que sobra son cuatro agentes sobre una tarea que la
persona excluyó, un reclamo tomado y una fila pendiente que frena esa tarea hasta que alguien la destrabe.

## Resumen

El 293 le dio al reclamo una tercera salida, `declined`, para cuando quien lanzó la corrida pidió no tomar
esa tarea. La instrucción de usarla está en el prompt del reclamo. El pedido no: ese prompt nunca lo llevó.

En la corrida de 0.103.2 que originó el 293 el agente del reclamo se negó citando el pedido textual, así que
de algún lado le llegó. El recorrido no se lo daba. Lo que esa sesión reportó es que el harness a veces
antepone a un agente el último mensaje del chat, y eso no está en manos de Cauce.

**Verificado** en la corrida de este caso: ninguno de sus 22 agentes recibió ese agregado —se buscó
«Workflow harness — user request» en los 22 transcriptos y dio cero—, y los 22 recibieron sólo el texto que
el recorrido arma. Que en 0.103.3 el reclamo lo corra `cauce-clerk` (caso 295) no se pudo separar como causa:
en esta corrida tampoco le llegó a los agentes de siempre. Lo que sí queda establecido es que declinar
dependía de algo que el recorrido no controla.

Y ese agregado no es parejo. El mismo día, otra sesión corrió 0.103.3 en una instancia real y reportó lo
contrario: sus ocho agentes, incluidos los `cauce-clerk`, recibieron el pedido relevado por el harness. Es
un dato de esa sesión y no se comprobó acá. Dos sesiones, misma versión, y una lo recibe y la otra no.

## Reproducción

Banco sidecar con 0.103.3 instalado desde npm y dos tareas `lite` en cola. Sesión real lanzada con:

```
/autobuild Sólo la tarea resta-dos-numeros; al cerrarla, parar. Sin push ni PR.
```

## Síntoma

Cerró `resta-dos-numeros` con su commit. Después reclamó `producto-dos-numeros`: el agente del reclamo corrió
el comando y devolvió `claimed: true, declined: false`. El prompt que recibió no nombra el pedido en ningún
lado; se leyó en su transcripto.

La tarea excluida pasó por `ready`, `plan` y `wip`. El plan sí recibió el pedido y puso como paso 1 que la
persona confirmara. `build` frenó ahí:

```
stopped: true, reason: build-blocked
blocked-on-human: el paso 1 del WIP exige que la persona confirme que producto-dos-numeros entra en esta
corrida; su pedido fue «Sólo la tarea resta-dos-numeros; al cerrarla, parar. Sin push ni PR.»
```

Quedó el reclamo tomado, una fila pendiente en `HUMAN_ACTIONS.md` y el commit `chore(planning): block
producto-dos-numeros`. Cuatro agentes de trabajo y uno de cierre escribieron 416.839 tokens a caché sobre esa
tarea, de 1.394.996 de la corrida entera.

## Causa raíz

`automatization/workflows/autobuild.js`, el prompt del paso `Claim`: dice «si quien lanzó la corrida pidió que
no se tome esta tarea…» y no interpola `ASKED`. Todas las fases que deciden con el pedido lo reciben por
`OPERATOR` u `OPERATOR_SAID`; el reclamo era la única que tenía que decidir con él y no lo recibía.

La prueba del 293 comprobaba que el prompt dijera `declined=true`. No comprobaba que trajera el pedido, y el
arnés contesta lo que se le programa: la salida `declined` se probó con una respuesta escrita a mano.

## Fix propuesto

- El prompt del reclamo lleva el pedido textual, sin la bandera `--max`.
- Sin pedido, el prompt no ofrece declinar: no hay contra qué.
- La prueba asercia que el pedido está en el prompt de cada reclamo.

## Tradeoffs

- Decide un agente que no carga reglas. Lo que decide es la dirección segura —no tomar—, y un reclamo
  declinado de más termina la corrida antes y lo dice.
- Un pedido que nombra una tarea que no es la primera de la cola termina la corrida sin hacer nada: el
  recorrido no elige tarea por nombre. Es así desde antes y no lo cambia este caso.

## Contexto de descubrimiento

La prueba real que el 293 dejó escrita como no corrida: «una corrida real donde un agente decline el reclamo».

## Relacionados

- 293 — el tope `--max` y la salida `declined`.
- 295 — los pasos de oficina con `cauce-clerk`.
- 292 — el pedido va en el mensaje que lanza la corrida.

## Cierre

**Resuelto en 0.103.4.**

### El recorrido de lo que este caso enumeró

- **El pedido en el prompt del reclamo — se hizo.** Textual y sin la bandera `--max`.
- **Sin pedido no se ofrece declinar — se hizo.** El prompt del reclamo termina en cómo reportar el comando.
- **La prueba — se hizo.** Asercia el pedido en el prompt de los dos reclamos de la corrida, y que sin pedido
  el prompt no nombra `declined`.
- **Tradeoffs — se pagan los dos.** El segundo queda como está: elegir tarea por nombre es otro pedido.

### Qué se corrió

- **La misma corrida real, con el arreglo.** Banco sidecar con el motor de esta rama, las mismas dos tareas y
  el mismo mensaje. Cerró `resta-dos-numeros` y terminó por la fase de cierre, sin `stopped`:

  ```
  done: ["resta-dos-numeros"] · phases: … Commit, Done, Pick, Claim, Closing
  producto-dos-numeros no se tomó, a pedido de quien lanzó la corrida: No se corrió el comando. Quien lanzó
  la corrida pidió: «Sólo la tarea resta-dos-numeros; al cerrarla, parar. Sin push ni PR.» — eso excluye …
  ```

  El reclamo de la segunda tarea hizo una sola llamada y escribió 3.863 tokens. No quedó reclamo en
  `claims/`, ni fila en `HUMAN_ACTIONS.md`, ni compuerta de hito, ni commit de bloqueo.
- **La comparación entre las dos corridas**, contando cada mensaje una vez:

  | | agentes | tokens escritos a caché | cómo terminó |
  |---|---|---|---|
  | 0.103.3 | 22 | 1.394.996 | `build-blocked` sobre la tarea excluida |
  | con el arreglo | 18 | 968.907 | cierre normal, una tarea hecha |

- **El primer reclamo no se declina.** En esa misma corrida el reclamo de `resta-dos-numeros` recibió el
  pedido y corrió el comando: `claimed: true`.
- **Tres mutaciones en rojo, en una copia**: el reclamo sin el pedido, declinar ofrecido aunque no haya
  pedido, y el pedido viajando con la bandera `--max` adentro.
- **Un pedido que no habla de tareas no declina nada.** Otra corrida real con el arreglo y las mismas dos
  tareas, lanzada con `/autobuild Sin push ni PR.`: los dos reclamos recibieron el pedido y los dos corrieron
  el comando. Cerró las dos tareas, 31 agentes. Era el riesgo del primer tradeoff, y en esta corrida no se dio.
- **La puerta entera**, `npm run ci`: 1231 pruebas.
