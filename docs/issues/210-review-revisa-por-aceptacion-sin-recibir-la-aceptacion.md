---
caso: 210
titulo: Review revisa por aceptación sin recibir la aceptación
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 210 — El prompt de Review pide revisar «por aceptación» y no dice cuál es

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: en las dos mediciones donde apareció, el revisor la encontró solo, buscándola en el
BACKLOG. Funciona por diligencia del agente y no por mecanismo, y la que encuentra puede no ser la que
rige: Ready puede refinar la aceptación en la corrida (`task.acceptance = ready.refinedAcceptance`), y
el BACKLOG sigue diciendo la vieja.

## Resumen

Build recibe la aceptación en su prompt y Critique critica el plan «contra» ella. Review, que es la fase
que juzga si el diff la cumple, recibe la instrucción «Revisá el diff real por aceptación, regresiones…»
sin el texto de la aceptación. Tiene que salir a buscarla, y lo que encuentra es la línea del BACKLOG, que
no incluye el refinamiento de Ready.

## Reproducción

```bash
grep -n "task.acceptance" automatization/workflows/autobuild.js
grep -n "Revisá el diff real por aceptación" automatization/workflows/autobuild.js
```

Y el prompt textual de Review, sacado del arnés de `autobuild` para una tarea de prueba, corrido con
`claude -p` sobre un banco fuera del árbol (mediciones C y B del plan del 2026-10-01).

## Síntoma

`task.acceptance` aparece en Classify, Surface, Ready, Plan, Critique, WIP y Build —líneas 692, 728, 811,
880, 888, 915, 940 y 993— y en ninguna llamada de Review. El prompt de Review del arnés termina en las
instrucciones de `RULED` y `SURFACED` sin nombrar la aceptación.

En las dos corridas, el revisor la buscó por su cuenta. Su lista de lo consultado trae, en C:

```
"planning/BACKLOG.md (grep cupón: cupon-en-el-total)"
```

## Causa raíz

`automatization/workflows/autobuild.js` — el prompt de la primera revisión y el de la re-revisión
(`Volvé a revisar el diff corregido de ${task.id}`) no interpolan `task.acceptance`.

## Fix propuesto

Los dos prompts de Review dicen contra qué aceptación se revisa: `task.acceptance`, que ya trae el
refinamiento de Ready si lo hubo.

## Tradeoffs

- El prompt crece una línea.

## Contexto de descubrimiento

Al armar la medición C del plan del 2026-10-01 —¿el prompt de Review empuja a revisar contra las reglas
en vez del código?— se extrajo el prompt textual del arnés y la aceptación no estaba. Las dos corridas de
medición (C y B) lo confirmaron: el revisor la buscó en el BACKLOG.

## Relacionados

- 206 — el mismo prompt de Review.
