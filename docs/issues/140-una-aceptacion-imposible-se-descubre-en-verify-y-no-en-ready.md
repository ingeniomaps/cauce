---
caso: 140
titulo: Una condición de aceptación que sólo puede cumplirse después de Done se descubre en Verify, con el trabajo ya hecho y sin poder cerrarlo
estado: resuelto
resuelto-en: 0.89.0
prioridad: alta
version-detectada: 0.87.0
---

# 140 — El recorrido paga Build entero para descubrir que la aceptación no era comprobable

**🟢 resuelto en 0.89.0** · detectado en 0.87.0 · prioridad **alta** — 1,2 M de tokens y once agentes para
terminar con el trabajo hecho, sin commit y sin entrada de DONE

## Resumen

Una condición de aceptación puede nombrar un artefacto que las fases **posteriores** producen: el commit,
`planning/done/<slug>.md`, la liberación del reclamo. Esa condición no se puede cumplir nunca, porque
Verify corre antes que Commit y que Done.

El recorrido la detecta —y hace bien en no aprobarla—, pero la detecta en **Verify**, o sea después de
Triage, Pick, Claim, Classify, WIP y Build. En la corrida real: **1.207.959 tokens, once agentes, 152
llamadas a herramienta y 23 minutos**, con el cambio ya aplicado en el árbol, nada commiteado y la tarea
sin poder cerrarse.

La parada fue correcta y su nombre también (`verify-hollow`). Lo que está mal es **cuándo**.

## Reproducción

Instancia sidecar 0.87.0. Promover una tarea cuya aceptación incluya una cláusula del tipo:

> …con las dos corridas registradas en la evidencia, que es lo que hace comprobable la aserción de
> ausencia.

Lanzar el recorrido. Termina así:

```
stopped: verify-hollow
detail: sin test que lo codifique: «…con las dos corridas registradas en la evidencia»: las dos corridas
de grep existen y las verifiqué en esta sesión (2 líneas antes, 0 después), pero no están escritas en
ningún artefacto durable. `planning/done/` no tiene entrada para el slug y `ops evidence planning --task
<slug>` devuelve «DONE no tiene la entrada».
```

Desglose de la corrida, del journal:

| fase | agentes | tokens |
|---|---:|---:|
| Triage | 2 | 205.450 |
| Claim | 1 | 86.567 |
| Classify | 2 | 214.615 |
| WIP | 1 | 111.870 |
| Build | 2 | 213.334 |
| **Verify** | **3** | **376.123** |

Verify es el 31 % del gasto, y las tres vueltas son el recorrido intentando encontrar cómo satisfacer una
condición que no se puede satisfacer.

## Síntoma

El modo de falla es el peor de los baratos: **todo verde hasta el final**. `check` estaba en verde antes
de lanzar, y la tarea tenía carril, aceptación y servicio. La condición imposible se lee perfecta — es una
frase en español sobre evidencia, que es justo lo que el protocolo pide en otras partes.

**Y la fase que podía haberla cazado se salteó por una razón que nadie eligió.** Ready corre cuando
`!mechanical || !vouched` (`autobuild.js:593`), y `vouched` es verdadero sólo si Classify corrió **en esta
corrida** (`:539`). La tarea venía con `[express]` y sin cast, así que Classify corrió, la avaló, y con eso apagó
Ready. Escribir el cast a mano habría hecho lo contrario: Classify se saltea y Ready corre.

El diseño es deliberado y está comentado en el fuente —un carril escrito a mano no tuvo lector que leyera
la aceptación—, pero deja un borde raro: **la tarea mejor especificada** —la que declara carril y cast—
recibe la fase que pregunta si está lista, y la que declara sólo el carril no la recibe, porque el
clasificador que la avaló miró la aceptación para elegir carril, no para ver si era comprobable. Son dos
preguntas distintas y el aval de una pasa por la otra.

Y deja el árbol a mitad: borrado aplicado, reclamo tomado, WIP escrito, cero commits. Recuperable a mano,
pero nadie lo sabe hasta que mira.

## Causa raíz

Ninguna fase anterior a Verify juzga si la aceptación es **comprobable**. Ready pregunta si es concreta,
si hay dependencias resueltas y si queda alguna decisión pendiente (`autobuild.js:596-598`) — las tres
cosas eran ciertas acá. Y Classify, que sí leyó la aceptación entera, la leyó para elegir carril.

Lo que falta no es una fase: es la pregunta. Ninguna de las dos se pregunta si la condición **puede
observarse en el momento en que se la va a observar**.

## Fix propuesto

1. **Una comprobación barata y sin modelo, en `ops check` o al promover**: una condición de aceptación que
   nombre `done/`, «la evidencia», el commit o el reclamo está describiendo el registro y no el producto.
   Es un patrón de texto, cuesta microsegundos y corre en las cuatro carriles.
2. **Que la fase que clasifica lo mire.** Classify ya lee la aceptación entera para decidir el carril y es
   la primera que corre en los cuatro; una pregunta más —«¿esto se puede observar antes de commitear?»—
   no agrega un agente.
3. **Que `verify-hollow` diga qué hacer.** Hoy nombra la cláusula; podría decir que una cláusula sobre la
   evidencia va en los campos de DONE —`tests:`, `qa:`, `commit:`—, que el contrato ya exige, y que por eso
   repetirla en la aceptación no agrega garantía sino un bloqueo.

Los tres son baratos. El 1 solo ya convierte una parada de 1,2 M en un aviso antes de empezar.

## Tradeoffs

Un patrón de texto puede marcar una aceptación legítima que mencione la palabra «evidencia» sin depender
de ella. Por eso el 1 debería **avisar** y no fallar, como ya hace `check` con las filas de HUMAN_ACTIONS
resueltas sin commit — el mismo criterio y la misma puerta.

## Contexto de descubrimiento

Corrida real del 2026-09-14 sobre una tarea `express` de una instancia sidecar: retirar tres documentos
obsoletos. La aceptación la había escrito el agente de la sesión anterior, y el defecto entró **en el
commit que arreglaba otro defecto de la misma aceptación**. El recorrido hizo el trabajo bien y encontró,
de paso, un segundo error en esa aceptación que nadie había visto: la aserción de ausencia no aserciaba la
ausencia de los archivos sino la de sus nombres, y daba verde con los archivos en disco.

O sea que el recorrido **encontró dos defectos reales**. Lo que este caso pide no es que deje de
encontrarlos: es que los encuentre antes de pagar Build.

## Relacionados

- **087** — la familia de las paradas que dejan el árbol a mitad y su rastro en HUMAN_ACTIONS.
- **137** — el otro defecto que dejó esa misma corrida.

## Cierre

**🟢 resuelto en 0.89.0** · `engine/planning/contracts.js`, `engine/cli/planning.js`,
`template/planning/PROTOCOL.md`, `test/planning/backlog.test.js`

Se tomó la **opción 1**, con una forma que el caso no había previsto y que medir obligó a encontrar.

### Contra lo que el caso enumeró

- **Opción 1, comprobación barata y sin modelo en `check`** — construida. `unverifiableAcceptance` recorre
  la cola y avisa; cuesta un regex y corre en los cuatro carriles, incluidos los que saltean Ready.
- **Opción 2, que Classify lo mire** — se decidió que no. Classify es un agente: mover la pregunta ahí la
  vuelve cara y la deja fuera de `check`, que es donde se mira antes de lanzar nada. La 1 la cubre gratis.
- **Opción 3, que `verify-hollow` diga qué hacer** — **se hizo distinto y en otro lugar**: el mensaje que
  dice qué hacer está en el aviso de `check`, que llega antes. Cambiar además el texto de `verify-hollow`
  sería escribir la misma razón en dos lugares, que es lo que R11 prohíbe.
- **Tradeoff «un patrón de texto puede marcar una aceptación legítima»** — **ocurrió, y en la primera
  medición**. Sobre 62 tareas reales el patrón disparó una sola vez, y esa única era legítima: la
  aceptación de `integraciones-por-tabla` nombra el commit **para declarar que no es condición de
  Verify**. Marcarla habría señalado como defecto a la redacción ejemplar.
- **Tradeoff «debería avisar y no fallar»** — se respetó: es `warning`, como el aviso de HUMAN_ACTIONS
  resueltas sin commit que nació del 121, el mismo daño y el mismo tamaño.
- **Las citas del propio caso** — dos estaban corridas unas sesenta líneas: la condición de Ready es
  `autobuild.js:593` y no `:653`, y lo que Ready pregunta está en `:596-598` y no en `:655-658`. Las otras
  —`vouched` en `:539`, `mechanical` en `:545`, Classify leyendo la aceptación entera— son correctas.

### Lo que el caso no preveía

- **El criterio no puede ser «nombra el registro».** Tiene que distinguir exigirlo de excluirlo, y eso no
  se puede leer de la prosa: la única aceptación real que lo nombra lo hace para excluirlo, y cualquier
  lista de frases que la reconociera enseñaría a escribir esa frase exacta para silenciar el aviso.
- **La salida ya estaba inventada en el repositorio, dos veces.** `(sin partir: …)` para el umbral de R17
  y `n/a — razón` para `tests:` y `commit:`. El comentario de `contracts.js` lo dice: «es la salida
  explícita, y como lleva su razón escrita se lee en el propio artefacto sin que nadie la cruce». De ahí
  sale `(fuera de verify: <razón>)`, y por eso se documenta en PROTOCOL: el aviso no puede mandar a usar
  vocabulario que el contrato no define.
- **El grano importa y no era el que yo usaba.** Se juzga condición por condición —el mismo grano con el
  que Verify contrasta, cuyo `uncovered` enumera criterios— porque las 62 aceptaciones reales traen
  varias: 11 de 12 en una instancia y 50 de 50 en la otra. Marcar el párrafo entero señala a las
  condiciones que están bien por estar al lado de la que no.
- **`P19`, que la aceptación de venotal cita al excluir, no existe** en el protocolo del molde ni resuelve
  en su instancia. Otra razón para no apoyar el criterio en lo que la prosa cite.

### Qué se corrió

- **Contra 62 tareas reales**, que es lo que decidió el diseño: con el patrón sobre la aceptación entera,
  **1 aviso y era falso positivo**. Con el criterio final —condición por condición, con marca de escape—
  sigue dando 1 sobre esa misma condición, y **poniéndole la marca baja a 0**. `gouduet-ops` da **0 sobre
  50 tareas** en las dos versiones.
- **Rojo previo, en copia por `tar` con verde de control**: 8/8 intactas. Quitar el reconocimiento de la
  marca mata la prueba; volver a juzgar la aceptación entera también. Las dos aserciones cuidan cosas
  distintas.
- **Verde**: `npm run ci` en 0 y **814 pruebas**.
