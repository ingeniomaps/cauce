---
caso: 087
titulo: La fila de HUMAN_ACTIONS que cierra el 081 la escribe un agente que el recorrido no espera, y no llega al disco
estado: resuelto
prioridad: alta
version-detectada: 0.78.0
---

# 087 — `planRejected` lanza el agente que registra la tarea y retorna en la línea siguiente

**🟢 resuelto en 0.79.0** · detectado en 0.78.0 · prioridad **alta** — deja sin efecto el arreglo del caso 081, y lo hace en silencio: el recorrido reporta la parada correcta y el registro queda sin la fila que la sostiene

## Resumen

0.77.0 cerró el [caso 081](081-un-plan-rechazado-dos-veces-no-vuelve-a-las-compuertas-que-lo-dejaron-pasar.md)
haciendo que un plan rechazado deje rastro: *«la tarea queda registrada en `HUMAN_ACTIONS.md` con el
motivo, y eso hace las dos cosas de una vez: `context` deja de ofrecerla y alguien ve la fila»*.

El mecanismo existe y no llega:

```js
const planRejected = (reason, unit, found) => {
  const detail = found.join('; ') || 'sin condiciones nombradas'
  write(`Registrá ${unit.id} en ${HUMAN}: …`, { label: 'plan-human' })
  return stop(reason, detail)
}
```

`write(...)` delega la escritura a un agente. La línea siguiente **retorna**. El agente queda huérfano.

Medido en una corrida real que terminó en `plan-rejected`:

```
resumen de la corrida:   10 agentes lanzados · 9 terminados
journal.jsonl:            9 entradas, todas con resultado
grep 'plan-human'         0
HUMAN_ACTIONS.md          0 filas con el slug
ops context               sigue ofreciendo la misma tarea
```

El décimo agente es el que escribiría la fila. Se lanzó, no llegó ni a registrarse en el journal, y el
recorrido ya había vuelto.

## Reproducción

Cualquier corrida que termine en `plan-rejected` (o `plan-blocked`, que usa el mismo camino). Después:

```
$ grep -c '<slug>' <ops>/planning/HUMAN_ACTIONS.md
0
$ node tools/ops.js context planning | grep TASK
TASK   <slug> …          ← la misma que acaba de rechazarse
```

## Síntoma

**El recorrido reporta bien y el registro queda mal**, que es la peor combinación para detectarlo: la
salida de la corrida nombra la parada, el motivo y las condiciones que la crítica encontró — todo
correcto y todo útil. Nada dice que la fila no se escribió.

Y la consecuencia es exactamente la que el 081 vino a evitar: **relanzar repite la corrida entera**.
`context` sigue ofreciendo la tarea, Ready y Decompose la vuelven a dejar pasar, y se paga otra vez el
precio completo de una planificación. En la instancia medida eso son ~780 k tokens y 23 minutos por
vuelta.

Vale decirlo con precisión: el 081 **no está abierto de nuevo**. Su diagnóstico fue correcto y el
arreglo elegido es el correcto. Lo que falla es la entrega del arreglo.

## Causa raíz

`write()` es asíncrona y `planRejected` no la espera. `stop()` corta la corrida en la línea siguiente, y
el agente lanzado se cancela con ella.

Es un caso particular de algo que conviene mirar entero: **toda escritura que el recorrido delega a un
agente justo antes de terminar tiene esta forma**. Vale la pena revisar si hay otras — cualquier `write`
seguido de `return` en el mismo bloque es candidata.

## Fix propuesto

```diff
- const planRejected = (reason, unit, found) => {
+ const planRejected = async (reason, unit, found) => {
    const detail = found.join('; ') || 'sin condiciones nombradas'
-   write(`Registrá ${unit.id} en ${HUMAN}: …`, { label: 'plan-human' })
+   await write(`Registrá ${unit.id} en ${HUMAN}: …`, { label: 'plan-human' })
    return stop(reason, detail)
  }
```

Y, porque una escritura que no ocurre no debería verse igual que una que sí:

```diff
+ Si la escritura no devuelve resultado, la parada lo dice: el motivo sigue siendo
+ `plan-rejected`, y el detalle agrega que la fila no se pudo registrar. Quien lea la
+ salida sabe que tiene que escribirla a mano, en vez de suponer que está.
```

## Tradeoffs

- Esperar suma la latencia de un agente a una corrida que ya está terminando. Son segundos contra los
  ~780 k tokens que cuesta la vuelta que esto evita.
- Un `await` en el camino de parada significa que un fallo al escribir puede demorar el corte. Por eso el
  segundo cambio: que el fallo se reporte en vez de reintentarse.

## Contexto de descubrimiento

Instancia real (sidecar, 0.78.0), 2026-09-10, en la tercera **medición controlada** del recorrido —una
sola tarea, para ver si cierra y a qué costo—. La corrida paró en `plan-rejected` con un hallazgo
excelente y sustantivo, y recién al ir a buscar la fila apareció que no estaba.

Se encontró contando: el resumen decía diez agentes y el journal nueve. Sin esa diferencia, la ausencia
de la fila se habría atribuido a que el arreglo todavía no estaba en esta versión.

## Relacionados

- **081** — este caso es la entrega fallida de su arreglo, no una vuelta atrás de su diagnóstico.
- **083** — misma corrida de mediciones. Los dos comparten la forma: el recorrido informa un estado que
  el disco no tiene.

## Cierre

**🟢 resuelto en 0.79.0** · `automatization/workflows/autobuild.js`,
`test/support/autobuild-harness.js`, `test/workflows/autobuild-review.test.js`,
`test/workflows/workflows.test.js`

### Lo que el caso enumeró

**El `await`** — hecho. `planRejected` es `async` y espera la escritura antes de parar.

**«Que una escritura que no ocurre no se vea igual que una que sí»** — hecho, y en las **tres** paradas
que dejan fila, no sólo en ésta: `plan-human`, `ready-human` y `verify-human` pasan por `registerHuman`,
que espera y devuelve lo que hay que agregarle al detalle. El motivo de la parada no cambia —sigue
siendo el que la causó, que es lo que el caso pedía— y el detalle dice que la fila hay que escribirla a
mano. Las otras dos ya esperaban su escritura, así que ahí el hueco era más chico: el agente corría,
pero si no contestaba la parada informaba igual una fila que nadie había escrito.

**«Vale la pena revisar si hay otras: cualquier `write` seguido de `return` en el mismo bloque»** —
recorrido, y la respuesta es **no hay otras**. Barriendo los nueve recorridos por llamadas a agente sin
`await` salen cinco, y cuatro son legítimas —`agent-eval.js:186`, `autobuild.js:360` (`readContext`),
`flow-eval.js:146`, `flow.js:260`— porque **devuelven** la promesa a quien la espera. La única que se
lanza y se abandona era la de este caso.

### Lo que apareció midiendo y el caso no preveía

**Había una prueba en verde aserciando exactamente la fila que no se escribía.** `un plan que ninguna
crítica aprueba queda pedido por escrito, no reintentado` comprueba desde 0.77.0 que la fila lleve
`HUMAN_ACTIONS` y el motivo, y pasaba — sobre un mecanismo que en una corrida real nunca llegaba al
disco.

La causa no era el caso que faltaba sino **el instrumento**: el arnés anotaba la llamada en el mismo
tick en que se la hacía, así que una llamada que nadie espera se veía idéntica a una esperada. Es la
precondición que R9 nombra en su último párrafo — un estado que no ocurre por el camino de producción
deja la prueba verde para siempre sobre algo que nadie va a vivir.

Se arregló el arnés antes que el defecto, y eso dio el rojo previo sin tocar una sola aserción: con el
`setImmediate` puesto y el recorrido todavía sin `await`, la prueba de 0.77.0 se cae sola.

**`async` no estaba declarada como palabra del lenguaje en la puerta de llamadas.** `async (a, b) => …`
pone la palabra justo antes de un paréntesis, igual que `await (…)`, así que la primera flecha asíncrona
del recorrido se reportó como una llamada a algo inexistente. Entró a `KEYWORDS` con su caso en la
prueba de detectores que el caso 084 dejó.

### Qué se corrió

`node --test test/workflows/*.test.js` — **123 en verde**, con la prueba nueva «la fila que registra la
parada se espera, y si no ocurre la parada lo dice», que mide las dos direcciones: que la escritura
termine antes de que el recorrido vuelva, y que un agente mudo cambie el detalle sin cambiar el motivo.
El arnés ganó `silent`, que simula el agente que se lanza y no contesta.

**Seis mutaciones, en un clon desechable bajo `/tmp` (R23):**

```
M1 la escritura vuelve a lanzarse sin esperarla (el defecto): fail 2 → ROJA
M2 no se mira si la escritura contestó:                       fail 1 → ROJA
M3 la parada toma el motivo de la escritura y no el suyo:     fail 1 → ROJA
M4 el arnés vuelve a anotar en el mismo tick:                 fail 0 → SOBREVIVIÓ
M5 el arnés contesta siempre, aunque se le pida mudo:         fail 1 → ROJA
M6 `async` deja de ser palabra del lenguaje para la puerta:   fail 2 → ROJA
```

**M4 sobrevive sola y eso es correcto**, no un hueco tapado: mientras la escritura se espere, que el
arnés anote antes o después no cambia nada. Lo que el `setImmediate` cambia es qué se puede **ver**, y
eso se mide combinándolo con el defecto:

```
defecto puesto, arnés arreglado   → ✖ la fila que registra la parada se espera…
                                    ✖ un plan que ninguna crítica aprueba queda pedido por escrito…
defecto puesto, arnés como estaba → ✖ la fila que registra la parada se espera…
```

Con el arnés viejo, **la prueba de 0.77.0 sigue en verde con el defecto puesto**. Ésa es la defensa del
cambio del arnés, y es la misma medición que explica por qué 670 pruebas no lo vieron.

`npm run ci`: **671 pruebas, 671 en verde**, cobertura de 57 archivos en su piso o por encima.
