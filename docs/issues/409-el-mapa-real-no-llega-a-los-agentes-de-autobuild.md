---
caso: 409
titulo: el Mapa real de workspace.md no llega a ningún agente de autobuild, porque el contrato no lo lleva y el preámbulo prohíbe releer el archivo
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 409 — `onboard` pide escribir dónde vive cada servicio en «## Mapa real», y ningún agente del recorrido lo recibe: cada fase que toca código lo redescubre explorando

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Es el primer nivel del índice que pedía el caso 404, y ya existe:
lo que falta es que viaje. Sin él, cada agente que entra a un repositorio lo explora para encontrar dónde va el cambio.

## Resumen

`organization/workspace.md` tiene una sección «## Mapa real» —qué servicios hay, dónde viven, dónde documenta cada uno
sus comandos— que `onboard` llena con una entrada por servicio. `ops contract` saca de ese archivo sólo «Excepciones de
autonomía», y el preámbulo que reciben las fases que trabajan les dice que no relean `workspace.md`. O sea que el mapa
se escribe y no lo lee nadie del recorrido.

## Reproducción

Leído en el fuente de 0.111.0:

```
engine/cli/contract.js:236        const excepciones = P.section(readIfAny(… 'workspace.md')), /Excepciones de autonom/)
automatization/workflows/autobuild.js:724   `no vuelvas a leer ${ROOT}/AGENTS.md, ${ORG}/workspace.md, ${CONFIG} ni …`
automatization/workflows/onboard.js:174     `En "## Mapa real", una entrada por servicio con su ruta, su runtime y sus ` …
$ grep -rn "Mapa real" engine automatization/workflows/autobuild.js
(sin salida)
```

## Causa raíz

`ops contract` (`engine/cli/contract.js`) no extrae la sección, y `SCOPE` (`automatization/workflows/autobuild.js`)
prohíbe leer el archivo que la tiene.

## Fix propuesto

Que `ops contract` lleve «Mapa real» textual, sin comentarios, en un campo `map`, **sólo** cuando el proyecto lo
escribió: igual al texto del molde, no viaja, y el contrato queda idéntico al de antes. `SCOPE` lo agrega cuando está.

La aceptación pide las mutaciones: con la comparación contra el molde quitada, la instancia recién creada recibe el
texto del molde como mapa y la prueba falla; con el agregado de `SCOPE` quitado, la prueba de las fases falla. Y por R9,
sin mapa escrito, `ops contract --json` y su salida de texto, lado a lado con los de `main`, son iguales.

## Tradeoffs

- El preámbulo crece con el mapa en cada fase que trabaja. Un mapa es corto por diseño —una línea por servicio—, y lo
  que ahorra es la exploración que cada agente hace para encontrar dónde va el cambio. Cuánto ahorra se mide, no se
  supone: es la medición del caso 404.

## Contexto de descubrimiento

Al analizar el caso 404, el 2026-10-20: el índice de primer nivel que el 404 pedía ya estaba en el molde.

## Relacionados

- 404 — los índices de código; esto es su primer paso.

## Cierre

**Resuelto en 0.112.0.** `ops contract` (`engine/cli/contract.js`, `workspaceMap`) lleva «## Mapa real» textual, sin
comentarios ni encabezado, en el campo `map`, y sólo cuando es distinto del texto del molde; la salida de texto suma
«mapa       N línea(s) de organization/workspace.md». `SCOPE` (`automatization/workflows/autobuild.js`) agrega «Dónde vive cada
cosa, según el Mapa real del proyecto:» y el mapa a las fases que trabajan, cuando el contrato lo trae.

El enunciado, ítem por ítem:

- **El campo `map`, sólo si es del proyecto**: se hizo así.
- **`SCOPE` lo agrega**: sí, en Plan, Build y Review, que son las que usan `SCOPE`.
- **Las mutaciones**: tres, abajo.
- **La identidad sin mapa (R9)**: abajo, igual byte por byte.
- **Tradeoff, cuánto ahorra**: se midió, y en el banco no se ve. Está en el cierre del 404, que es donde se preguntaba.

**Lo que se corrió para saber que funciona.**

- `test/planning/contract.test.js`, «contract lleva el Mapa real que escribió el proyecto, y nada si sigue siendo el del
  molde», y `test/workflows/autobuild-map.test.js`. Las dos rojas antes del cambio.
- Mutaciones en una copia fuera del árbol, las tres en rojo: con el texto del molde viajando como mapa; con los comentarios
  adentro; sin el agregado en `SCOPE`.
- Identidad: una misma instancia recién creada, leída con el motor de `main` y con el de la rama. `ops contract --json`
  (6474 bytes) y su salida de texto, iguales.
- Real, en el banco instalado del experimento del 406: con el mapa escrito, `ops contract .` imprime «mapa       1 línea(s)
  de organization/workspace.md». La medición del 404 usó el mapa con el mismo texto con que `SCOPE` lo agrega.

**Lo que encontró la revisión del conjunto, y se decidió que no**: la revisión temió que un molde viejo, distinto del actual,
viajara como si fuera el mapa del proyecto. La sección «Mapa real» de `template/organization/workspace.md` es la misma en
las cuatro versiones que tuvo el archivo (`git log` y el mismo hash del cuerpo en cada una), así que no hay molde viejo que
pueda llegar así. Si un proyecto dejó la instrucción junto a lo que escribió, ese texto ya es suyo.
