---
caso: 211
titulo: Done resume el hecho de revisión y pierde lo que el recorrido le pasó
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 211 — La entrada de `done/` no trae lo que el hecho de revisión decía

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: es la entrega de otros tres casos que se dan por resueltos sólo porque el prompt de
Done lleva el dato —el 122 (contra qué reglas se revisó), el 205 (qué superficie crítica tocó) y el 207
(qué se mandó a corregir)— y las pruebas del arnés miran el prompt, no el disco. En una corrida real, lo
que llegó a `done/` no traía ninguno de los tres.

## Resumen

El recorrido arma el hecho de revisión —veredicto, quién, sobre qué, decisiones, reglas, superficie
crítica, lo corregido— y se lo pasa al agente de Done para que escriba la entrada. El agente lo resume: en
la corrida medida escribió el veredicto y dos archivos, y descartó el resto. Nada falla: `check` pasa y la
entrada se lee completa.

## Reproducción

Banco fuera del árbol (instancia sidecar con el motor congelado en `8a93c877`), una superficie crítica
declarada y una tarea `express` que la toca; `claude -p "/autobuild"` (2026-10-01, USD 8,20).

## Síntoma

El hecho que recibió Done (transcripción del agente `done`, recortado):

```
Hechos: lane=express; review=aprobado por software-architect, software-architect, sobre node instancia/tools/ops.js
agents list … · 1 decisión(es) registrada(s) · reglas: planning/rules/system/code-shape.md, … · toca la superficie
crítica Total del pedido (app/src/order-total.js);
```

Lo que escribió en `planning/done/umbral-envio-gratis.md`:

```
  review: aprobado por software-architect, sobre app/src/order-total.js y app/test/order-total.test.js
```

Se perdieron la decisión registrada, las reglas y la superficie crítica.

## Causa raíz

`automatization/workflows/autobuild.js`, prompt de la fase Done: pide escribir `lane y review` «en el
formato de entrada que trae este preámbulo» y les pasa los hechos, pero no dice que van textuales. Un
hecho largo —la lista de lo consultado lo es— invita a resumirlo, y el resumen elige qué dejar.

Las pruebas del arnés que cubren el 122, el 205 y el 207 asercian el prompt de Done, que sí trae el dato:
miden una precondición que no es la que llega al disco (R9, último párrafo).

## Fix propuesto

El prompt de Done dice que `lane` y `review` se copian **textuales** de los hechos, sin resumir. Y la
prueba real lo mide sobre la entrada escrita, no sobre el prompt.

## Tradeoffs

- La entrada de `done/` crece: lo consultado puede ser una lista larga. Es el registro que se audita, y lo
  que se acorta a mano es lo que después no se puede reconstruir.

## Contexto de descubrimiento

Prueba real de los casos 205 a 207, el 2026-10-01: la fase `Surface`, el piso de carril y los campos del
Review funcionaron en el recorrido, y lo que no apareció en `done/` fue lo que el recorrido sí le había
pasado a Done.

## Relacionados

- 122, 205, 207 — los tres cuyos datos se perdían en este paso.

## Cierre

Recorrido contra el caso entero:

- **Fix, `lane` y `review` textuales** → se hizo.
- **La prueba real mide el disco y no el prompt** → se hizo: abajo.
- **Tradeoff, entradas más largas** → aceptado.
- **Los tres casos afectados (122, 205, 207)** → quedan cubiertos por este arreglo; las entradas escritas
  antes no se reescriben.

**Probado corriendo.** Se repitió sólo el paso de Done, con su prompt real de la corrida del 205 más el pedido
de copia textual, sobre una copia del banco devuelta al estado previo al cierre (USD 0,69). La entrada escrita,
leída con `readDone`, trae `toca la superficie crítica`, `reglas: planning/rules…` y `1 decisión(es)
registrada(s)` —los tres en `true`—, donde la corrida original había escrito sólo el veredicto y dos archivos;
`check` pasa. Arnés: el pedido textual está en el prompt, y quitarlo se vio en rojo.
