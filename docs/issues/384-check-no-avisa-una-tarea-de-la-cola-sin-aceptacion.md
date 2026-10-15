---
caso: 384
titulo: check no avisa una tarea de la cola sin «_Aceptación: …_», y autobuild la recibiría vacía
estado: abierto
prioridad: baja
version-detectada: 0.106.0
---

# 384 — Una línea del backlog con la aceptación escrita en prosa, sin el rótulo, pasa `check` en verde y el parser la lee como aceptación vacía

**🔴 abierto** · detectado en 0.106.0 · prioridad **baja** — se vio antes de lanzar y no costó una corrida, pero
habría llegado a Ready una tarea sin aceptación con `check` en verde.

## Resumen

`engine/planning/parser.js:208` toma la aceptación sólo de `_Aceptación: …_`. Una tarea promovida como
`- [ ] **slug** [lite] — <texto con su «Rojo si:»> *(criterio C1)* …` tiene `acceptance: ''`. `planning check`
(con las reglas de la instancia) dio «alineado» con doce tareas así. El único aviso existe en
`engine/planning/recurring.js:91`, que es para tareas recurrentes.

## Reproducción

```
node -e "const P=require('@ingeniomaps/cauce/engine/planning/parser.js');
console.log(P.taskFromLine('- [ ] **x** [lite] — Hace algo. Rojo si: falla. *(criterio C1)* (service: s)').acceptance)"
```

Imprime una línea vacía. Con `_Aceptación: Hace algo. Rojo si: falla._` imprime el texto.

## Fix propuesto

`check` marca como error una tarea de la cola sin aceptación parseada, con el mismo mensaje que `recurring.js`.

## Contexto de descubrimiento

Al promover una épica a la cola, en la instancia `acme-ops`. Se notó leyendo el parser antes de lanzar `autobuild`.
