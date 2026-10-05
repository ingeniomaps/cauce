---
caso: 267
titulo: una corrida reanudada no le pasa a Review las condiciones de la crítica
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 267 — Al retomar desde el WIP, Review no recibe las condiciones con las que la crítica aprobó el plan

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: la condición sigue escrita y Build la lee, pero quien tenía que comprobarla no se
entera. Y retomar es el camino normal después de cualquier parada.

## Resumen

Desde el 248 la crítica puede aprobar un plan con condiciones para quien construye, y Review recibe la
orden de comprobarlas sobre el diff. Viajan en memoria. Una corrida que retoma desde el WIP no pasa por la
crítica, así que llega a Review sin ellas: están en el WIP, que Build lee y Review no.

## Reproducción

En el arnés: una corrida que arranca con el WIP activo, que es como retoma.

## Síntoma

El prompt de Review no nombra ninguna condición ni el WIP. En la corrida real del 2026-10-05 la tarea se
retomó después de una parada: el WIP traía «Condiciones con las que la crítica aprobó el plan» y Review
revisó sin esa lista.

## Causa raíz

`automatization/workflows/autobuild.js`: `approved` se llena en el bloque de Plan y Critique, que una
corrida con `wipActive` saltea. Review arma su pedido sólo con `approved.conditions`.

## Fix propuesto

Cuando la corrida retoma y no trae condiciones en memoria, Review recibe a dónde leerlas: el archivo del
WIP, con la orden de comprobar las que estén ahí.

## Tradeoffs

- Review abre un archivo más. Sólo al retomar.
- Lo que el WIP diga lo escribió un agente en prosa: Review lee lo que haya, no una lista estructurada.

## Contexto de descubrimiento

Anotado al cerrar el 248 como límite conocido.

## Relacionados

- 248 — una segunda crítica con condiciones para el recorrido como si bloqueara.

## Cierre

**Resuelto en 0.101.0.** Una corrida que retoma le dice a Review qué archivo del WIP abrir y que compruebe
sobre el diff las condiciones que encuentre ahí.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **Tradeoff «Review abre un archivo más» — se paga**, sólo al retomar.
- **Tradeoff «lo que el WIP diga lo escribió un agente en prosa» — sigue en pie**, y la sonda de abajo
  muestra que alcanza.

### Qué se corrió

- **Antes y después en el arnés**: al retomar, el prompt de Review no nombraba ni condiciones ni el WIP;
  ahora nombra el archivo. En una corrida que sí criticó el plan las condiciones van escritas, como antes.
- **Dos mutaciones en rojo**, en una copia: Review sin recibir nada al retomar, y toda corrida contando
  como retomada.
- **Una sonda con un revisor real**: el prompt literal, un WIP que registra una condición de la crítica
  —el predicado nuevo lleva identificador en inglés— y un diff que cumple la aceptación y la incumple, con
  `tieneEmail`. El revisor abrió el WIP y devolvió, con `blocking: true`: «Condición de la crítica
  incumplida […] El diff lo introduce como `tieneEmail` (src/alta.js:4)».
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una corrida entera retomada con una condición pendiente.
