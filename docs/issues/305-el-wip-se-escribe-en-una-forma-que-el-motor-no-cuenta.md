---
caso: 305
titulo: el wip se escribe en una forma que el motor no cuenta
estado: resuelto
resuelto-en: 0.103.5
prioridad: media
version-detectada: 0.103.4
---

# 305 — Un WIP con los pasos sin numerar es un plan vacío, y nada lo dice hasta el cierre del turno

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **media**.

**Prioridad media**: la tarea se construye igual. El motor no ve el plan, y lo que cuenta pasos —la
reanudación, el guard de planning— trabaja sobre cero.

## Resumen

El motor cuenta los pasos de un WIP por su forma: `1. [ ] paso`. En una corrida real el agente de escritura
los puso como `- [ ] paso`. El recorrido sólo comprobaba que el WIP quedara activo, así que siguió.

## Reproducción

Instancia real con 0.103.4, en la tercera tarea de una corrida. El mismo agente lo había escrito bien en las
dos anteriores: no es sistemático.

## Síntoma

Build tildó nueve pasos que el motor no contaba. Al cerrar el turno, el guard de planning frenó por un WIP
activo sin pasos. `ops context` mostraba el plan vacío hasta que alguien renumeró el archivo a mano.

## Causa raíz

`automatization/workflows/autobuild.js`, fase WIP: el esquema de respuesta pide `wipActive` y nada más. Y
`engine/planning/parser.js:376` cuenta con `/^\d+\.\s+\[\s\]/`. Entre las dos no hay nada que compare.

Es el mismo defecto que el 301 encontró en `done/`: se escribe un archivo con formato y no se valida.

## Fix propuesto

- Decir la forma de un paso en el prompt.
- Que quien lo escribe pregunte al motor cuántos pasos cuenta, y que el recorrido lo compare contra el plan.

## Tradeoffs

- Una llamada más en la fase WIP, para correr `ops context`.
- El número lo reporta el agente. Un agente que lo inventara pasaría; lo que se cierra es el descuido.

## Contexto de descubrimiento

La misma corrida del 304.

## Relacionados

- 301 — la entrada de `done/` sin validar.
- 295 — el agente de escritura.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **La forma en el prompt — se hizo.** «Numerados y sin tildar, uno por línea».
- **La comparación — se hizo.** El agente corre `ops context --json` y reporta en `steps` los pasos
  pendientes que el motor cuenta. Si no son los del plan, el recorrido para con `wip-malformed` antes de
  Build, nombrando los dos números.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **Dos corridas reales con el motor de esta rama, tres WIP escritos.** Los tres pasaron la comparación, en
  cuatro llamadas cada uno.
- **La parada, en el arnés**: con el motor contando cero o dos pasos sobre un plan de uno, la corrida para
  con `wip-malformed` y no llega a Build.
- **Dos mutaciones en rojo, en una copia**: sin comparar los pasos, y sin pedir la forma numerada.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un WIP mal escrito en una corrida real. No volvió a salir; la parada se probó en
  el arnés.
