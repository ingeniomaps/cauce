---
caso: 236
titulo: workspace.md no tiene dónde declarar credenciales ni guards propios
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 236 — El molde de `workspace.md` no trae tablas para las credenciales ni para los guards propios de la instancia

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: es forma, y la instancia lo agregó sola.

## Resumen

conorbi-ops agregó a `organization/workspace.md` una tabla «Credenciales» (servicio, variable, para qué) y una «Guards propios» (guard, qué frena, pruebas). El molde menciona las credenciales en prosa y no tiene dónde listar guards propios.

## Reproducción

Verificado leyendo `template/organization/workspace.md` contra el de conorbi.

## Síntoma

Cada instancia inventa dónde anotarlo, o no lo anota.

## Causa raíz

`template/organization/workspace.md`.

## Fix propuesto

Las dos tablas vacías en el molde.

## Tradeoffs

- Ninguno: es molde.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 223 — los guards propios.

## Cierre

Resuelto en 0.100.0.

- **Las dos tablas vacías en el molde** — se hizo, en `template/organization/workspace.md`. «Credenciales» va
  dentro de «Integraciones y ambientes», al lado del párrafo que ya pedía nombrarlas, y «Guards propios» va
  como sección propia antes de «Excepciones de autonomía». Cada una lleva un ejemplo comentado, como el de
  «Límites», para que no se lea como un dato del proyecto.
- **Por qué antes y no al final** — lo encontró la puerta. El aviso de párrafos que no llegan a los agentes
  mira «Excepciones de autonomía», y quien agrega un límite lo escribe al final del archivo, que es lo que
  `test/planning/contract.test.js` fija. Con «Guards propios» al final, ese párrafo caía en la sección
  equivocada: dos pruebas existentes se pusieron rojas.
- **Tradeoff: ninguno** — se comprobó que no lo hubiera. `workspace.md` lo leen el contrato que viaja a cada
  agente y el aviso de credenciales sin dueño. Con las tablas, una instancia nueva da `check` en verde y sin
  avisos, y `ops contract` dice lo mismo que con el molde de `main`: `límites 3 · contratos 4821 caracteres`.
  Las tablas no se cuelan entre los límites.

Lo que el caso no preveía:

- **`workspace.md` es de la instancia**, y `upgrade` no lo toca, así que las tablas llegan sólo a una instancia
  nueva. El CHANGELOG lo dice.

Prueba real: se corrió `ops init` con el molde de esta rama, y `ops check` salió en verde y sin avisos. Se
corrió `ops contract` contra el molde de `main` y dio lo mismo. Las dos pruebas de `contract.test.js` que
se pusieron rojas con la primera ubicación volvieron a verde al moverla.
