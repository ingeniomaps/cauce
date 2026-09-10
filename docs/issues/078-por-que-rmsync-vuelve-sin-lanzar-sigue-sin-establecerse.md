---
caso: 078
titulo: Por qué `rmSync` vuelve sin lanzar bajo una carrera sigue sin establecerse, y tres rodeos siguen puestos por eso
estado: resuelto
resuelto-en: 0.77.0
prioridad: baja
version-detectada: 0.76.0
---

# 078 — La causa del 073 está apagada; el mecanismo por el que se manifestaba, no

**🟢 resuelto en 0.77.0** · detectado en 0.76.0 · prioridad **baja** — dos de los tres rodeos no dependían
del desconocido sino de una guarda, y esa guarda no tenía prueba

## Resumen

El [073](073-el-borrado-del-banco-deja-objetos-de-git-y-no-lanza.md) estableció **quién escribía**
—`git maintenance`, que `git commit` deja corriendo detrás— y lo apagó. Lo que no estableció es **cómo**
esa carrera hace que `fs.rmSync` vuelva sin lanzar dejando archivos.

Sale como caso propio y no como una línea dentro de aquél porque tiene una consecuencia viva: **tres
rodeos siguen en el código sostenidos por este desconocido**, y mientras no se sepa, retirarlos es una
apuesta.

## Reproducción

**Sólo la mitad.** Con un escritor concurrente sincronizado contra el borrado —un proceso que recrea el
árbol mientras `rmSync` lo recorre— la carrera se reproduce con facilidad y produce la cara **ruidosa**:

```
node v24.18.0 · 20 vueltas → limpio 3 · lanzó 17 ENOTEMPTY · volvió sin lanzar y dejó cosas 0
node v26.8.2  · 20 vueltas → limpio 1 · lanzó 19 ENOTEMPTY · volvió sin lanzar y dejó cosas 0
```

`ENOTEMPTY` es literalmente el síntoma que los reintentos del `rmSync` vinieron a tapar. La cara
**silenciosa** —volver sin lanzar y dejar 90 archivos en 27 directorios, que es lo que la guarda capturó
en CI— no se reprodujo ni una vez en 40 vueltas.

## Síntoma

Ninguno, desde que la causa está apagada. Lo que hay es código que nadie puede retirar con criterio.

## Causa raíz

No establecida, y es de terceros: `fs.rmSync` recursivo está implementado en C++ desde Node 22 —
`binding.rmSync(path, maxRetries, recursive, retryDelay)`, y `force` **no** se le pasa—, así que el
recorrido y su manejo de errores no se pueden leer desde JavaScript.

Hay una clase de fallo documentada que encaja en forma pero no en entorno: `nodejs/node#61067` describe
`rmSync` como no-op que **no lanza**, y está acotado a rutas no ASCII en Windows. Acá el entorno es Linux
y las rutas son ASCII, así que **no es ése**; se nombra porque establece que la implementación nativa
tiene ese modo de fallo y no para atribuirle éste.

## Fix propuesto

Ninguno de producto: no hay defecto que arreglar. Lo que hay que decidir es **qué se hace con los tres
rodeos**, y para eso hace falta el mecanismo o una espera:

- **Los reintentos del `rmSync`** —`maxRetries: 5, retryDelay: 50`— puestos por el `ENOTEMPTY`.
- **El `force` del andamiaje**, puesto porque algo sobrevivía al borrado.
- **El `rm` antes del enlace**, por lo mismo.

Los tres tapaban caras del mismo escritor, que ya no corre. Las dos vías:

- **Esperar y mirar.** Si no vuelven a disparar durante varias versiones, retirarlos con esa medición como
  evidencia. Barato y lento, y **es lo que está pasando ahora sin que nadie lo mire**: ése es el motivo
  de este caso.
- **Establecer el mecanismo.** Caro: pide reproducir la cara silenciosa, y 40 vueltas con contención no
  la produjeron. Sin ella no se puede afirmar que un `rmSync` sin escritor concurrente sea seguro.

## Tradeoffs

- **Retirar los tres sin saber** deja al banco sin red frente a cualquier otro escritor transitorio, y el
  fallo que produciría es el mudo que costó tres investigaciones.
- **Dejarlos para siempre** es deuda que se lee como decisión: el próximo que los toque no va a saber si
  cuidan algo vivo o son restos.
- **Perseguir el mecanismo** es trabajo sobre un runtime ajeno para retirar tres líneas propias. Casi
  seguro no lo vale — y decirlo es el resultado, no una excusa para no anotarlo.

## Contexto de descubrimiento

Cerrando el 073, y de una pregunta del operador: «¿aún tenemos algún hueco?». La respuesta era que sí y
que vivía adentro de un caso cerrado — la forma que R15 nombra como la que se pierde. Se saca acá para
que tenga condición de activación y alguien que la mire.

## Relacionados

- [073](073-el-borrado-del-banco-deja-objetos-de-git-y-no-lanza.md) — estableció el escritor y lo apagó.
  Este caso es el desconocido que aquél declaró y los rodeos que ese desconocido sostiene.
- [066](066-el-banco-que-no-se-rehace-falla-mudo.md) — puso la guarda que capturó la evidencia.

## Cierre

**Resuelto en 0.77.0**, y el caso se cierra distinto de como se enunció porque su propia premisa era falsa
en dos tercios.

### La premisa que no se sostiene

Este caso decía «tres rodeos sostenidos por un desconocido». **Sólo uno lo estaba.** Los otros dos
dependían de la guarda del [066](066-el-banco-que-no-se-rehace-falla-mudo.md), no del mecanismo de
`rmSync`:

```js
clearBench(dir, …)        // borra y comprueba
if (problema) fail(…)     // ← de acá para abajo, el directorio NO existe
IN.scaffold(dir, { …, force: true })   // el force sólo servía si algo sobrevivía
fs.rmSync(link, { force: true })       // el link no puede existir: scope acaba de nacer
```

El `force` del andamiaje y el `rm` antes del enlace eran **inalcanzables**, y no por una espera de varias
versiones: por una precondición que ya estaba escrita en la línea de arriba. Lo que faltaba no era tiempo,
era leerla.

### Lo que impedía retirarlos, y que este caso tampoco tenía

**La guarda no tenía una sola prueba.** Existe desde el 066 y nunca se ejerció: medido en un clon
desechable, borrar su línea entera **no ponía nada en rojo**. Retirar los dos rodeos apoyándose en ella
habría atado la corrección a una línea que nadie observaba — que es cambiar tres líneas muertas por un
riesgo real.

Por eso el orden fue: primero darle prueba a la guarda, después retirar lo que su precondición vuelve
inalcanzable.

### El recorrido de lo que este caso enumeró

- **«Esperar y mirar si los rodeos disparan» — no hizo falta para dos de los tres.** Su condición de
  activación era el tiempo, y lo que los retiró fue una precondición que ya se cumplía.
- **«Establecer el mecanismo» — no se hizo, y se decide que no.** Es trabajo sobre un runtime ajeno para
  retirar líneas propias, y la cara silenciosa no se reprodujo en 40 vueltas con contención. El caso ya
  lo anotaba como «casi seguro no lo vale»; ahora eso es la decisión y no una sospecha.
- **Los reintentos del `rmSync` se quedan, y su razón cambió.** Ya no es «no sabemos por qué algo
  sobrevive»: es que son lo único que corre **antes** de la comprobación, así que cubren a cualquier otro
  escritor transitorio. Están dentro de `clearBench`, con esa razón escrita.
- **Tradeoff «retirar los tres sin saber deja al banco sin red» — se pagó sólo donde no había nada que
  perder.** Los dos que salieron eran inalcanzables; el que cubre algo se quedó.
- **Tradeoff «dejarlos para siempre es deuda que se lee como decisión» — se cerró para dos de tres**, y
  el que queda ya no se lee como resto: dice qué cubre y por qué corre antes.

### Lo que apareció y el caso no preveía

**R23 se aplicó al motor, no sólo a las pruebas.** `clearBench` comprueba que el destino cuelgue de
`<root>/.cauce-eval` antes de borrar, y se niega nombrando la ruta y contra qué la comparó. Hoy `dir` se
arma de nombres ya validados y no puede apuntar afuera; la comprobación existe porque el costo de que
algún día pueda no es un resultado incorrecto sino trabajo perdido — que es lo que el
[080](080-una-prueba-resolvio-contra-la-raiz-y-borro-el-repositorio.md) acaba de costar dos veces.

### Qué se corrió

- **Que nadie observaba ni la guarda ni los dos rodeos**, medido antes de tocar nada: borrar la guarda,
  15 de 15 en verde; sacar los dos rodeos, 15 de 15 en verde.
- **Cinco mutaciones**, cuatro en rojo: la guarda dejando de mirar si sobrevivió algo, el destino dejando
  de comprobarse, la comparación sin el separador —que en su primera versión **sobrevivió** y obligó a
  agregar los dos casos que la ejercen: el banco borrándose a sí mismo y el vecino con el mismo prefijo— y
  el rechazo dejando de nombrar las rutas.
- **Todas en un clon desechable bajo `/tmp`**, con el repositorio de trabajo comprobado intacto después de
  cada una (R23).
- **La puerta entera**: 657 pruebas, 0 fallos.

### Lo que sigue sin observarse, y se dice

`if (problema) fail(problema, 2)` — el cableado entre la función y el corte. La mutación que lo ignora
**sobrevive**: no hay forma de que `dir` apunte fuera del banco por el camino de producción, y la otra
rama es la que este caso existe para decir que no se puede provocar. Queda declarado acá y no tapado: es
una línea, su función sí está probada, y lo que la ejercería es exactamente el fallo cuya causa el 073 ya
apagó.
