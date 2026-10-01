---
caso: 205
titulo: el ciclo de construcción no mira las superficies críticas que declara la empresa
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 205 — `autobuild` clasifica y revisa sin leer «Qué no se puede romper»

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: el dato ya existe en cada instancia —lo pide `organization/company.md`— y hoy no
llega al único recorrido que construye y entrega código sin una persona en el medio. Una tarea que toca
el alta de un pedido puede ir por `express`, que no convoca revisor.

## Resumen

`template/organization/company.md:42` tiene la tabla «Qué no se puede romper», y `change-review` la
consulta en `scope` desde 0.47.0. `autobuild` no la lee en ninguna fase: Classify decide el carril con un
criterio que no la nombra, y el carril `express` saltea Review entero. Un «umbral interno» —el ejemplo
literal de `express`— que vive en el flujo de pagos se entrega sin que nadie lo mire.

## Reproducción

Desde la raíz del repositorio, sobre `main` en `b8077d94`:

```bash
grep -c "company.md" automatization/workflows/autobuild.js
grep -rln "company.md\|organization/company" engine automatization/workflows
sed -n 279,289p automatization/workflows/autobuild.js
sed -n 991,994p automatization/workflows/autobuild.js
```

## Síntoma

```
0
engine/core/onboarding.js
engine/core/ownership.js
automatization/workflows/onboard.js
```

Sólo el onboarding escribe o reconoce el archivo; ni `autobuild` ni `ops context` lo leen. El criterio
de carriles:

```
'se hace ni lo hacés. Lane: `express` si la aceptación nombra un valor literal y el resultado no ' +
'lo mira nadie —un typo, un umbral interno, un renombre—; `directo` si es igual de mecánico pero ' +
...
```

Y lo que `express` saltea:

```
  let reviewFact = 'no corrió (el carril express no convoca revisor)'
  if (!express) {
    phase('Review')
```

## Causa raíz

- `automatization/workflows/autobuild.js:279-289` — `CLASSIFY_RULES` decide el carril por la forma del
  cambio y no recibe las superficies declaradas.
- `automatization/workflows/autobuild.js:991-993` — `express` no convoca revisor.
- `automatization/workflows/autobuild.js:994-999` — Review tampoco las recibe, así que aunque corra no
  puede decir si el diff toca una.

## Fix propuesto

Decidido con Manuel el 2026-10-01: **una tarea que toca una superficie crítica no va por `express`.**

1. Classify recibe las filas de «Qué no se puede romper» y devuelve, por tarea, `critical`: el nombre de
   la superficie que toca, o vacío.
2. El workflow, no el agente, aplica el piso: con `critical` no vacío, un `express` se convierte en
   `directo` —el carril mecánico que sí pasa por Review— y queda dicho en el registro.
3. Review recibe las mismas filas y declara si el diff toca alguna; el hecho de revisión lo lleva a
   `done/`.
4. Tabla en `Por definir` o ausente: se informa como hallazgo, igual que en `change-review`, y no frena.

Falta decidir al mejorar el caso si las filas las arma `ops context` —una lectura por corrida, ya
parseada— o si se le pasa la ruta al agente. La primera es la que no depende de que el agente abra el
archivo. **Decidido: `ops context`**, con el parser en `engine/planning/surfaces.js`.

## Tradeoffs

- Más tareas pasan por Review: toda tarea mecánica sobre una superficie crítica cuesta una llamada más.
  Es el costo buscado; si una empresa declara media aplicación como crítica, lo va a sentir.
- El piso depende de que Classify reconozca que la tarea toca la superficie. Un falso negativo deja la
  tarea donde está hoy; no empeora nada, pero tampoco lo arregla. Medirlo es parte del cierre.
- `change-review` y `autobuild` pasan a leer la misma tabla con dos mecanismos: si se elige `ops
  context`, conviene que `change-review` lo use también para no tener dos lecturas que diverjan.

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: su motor de review escala a bloqueante lo que toca
un flujo crítico declarado (`dropi-code-review/skills/_shared/review-engine.md:548-550`). Al buscar el
equivalente en cauce apareció que la tabla existe y el ciclo de construcción no la usa.

## Relacionados

- `change-review`, etapa `scope` — el único consumidor actual de la tabla (CHANGELOG 0.47.0).
- 206 — el mismo Review, del lado de qué cita cada hallazgo.

## Cierre

Recorrido contra el caso entero:

- **Fix 1, Classify recibe las superficies** → se hizo. Además del clasificador, quien decide es una pregunta
  propia (`critical-surface`), porque el carril también se escribe a mano y ahí Classify no corre.
- **Fix 2, el piso lo aplica el recorrido** → se hizo: `express` con superficie sube a `directo`. Lo que no se
  puede determinar —un `null` o cualquier respuesta no vacía— también sube.
- **Fix 3, Review declara la superficie y llega a `done/`** → se hizo, con un hueco que la prueba real
  encontró y salió como caso propio: el agente de Done resumía el hecho y la superficie no llegaba al disco
  (caso 211, resuelto en esta misma versión).
- **Fix 4, tabla en `Por definir`** → se hizo: viaja como `surfacesPending` y queda escrito en el hecho de
  revisión, sin frenar.
- **Lo que faltaba decidir, quién arma las filas** → `ops context`, con el parser en
  `engine/planning/surfaces.js`.
- **Tradeoff, más tareas pasan por Review** → aceptado: es el costo buscado.
- **Tradeoff, falsos negativos del juicio** → se decidió no medir la tasa: una corrida no estima una tasa
  (R20), y un falso negativo deja la tarea donde estaba antes de este caso, sin empeorar nada.
- **Tradeoff, que `change-review` use también `ops context`** → se decidió que no: `scope` necesita la tabla
  entera, con qué se detiene y a quién alcanza, y la lee del archivo; las dos lecturas parten del mismo
  archivo y no pueden divergir en el dato.
- **Lo que el caso no preveía:** con la tarea subida, el WIP y `done/` seguían diciendo `lane: express`. Lo
  marcó el propio revisor en la corrida real; ahora va el carril que corrió (`0e7492de`).

**Probado corriendo.**
- `ops context --json` en un banco devuelve `{"declared":[],"pending":true}` con la tabla del molde y las
  filas declaradas cuando se llenan.
- Arnés: `test/workflows/autobuild-critical.test.js`, 7 casos. Mutaciones vistas en rojo: quitar el piso,
  fallar abierto ante `null`, quitar el «no toca superficies críticas», sacar `surfaces` de `context`,
  contar `Por definir` como declarada y no subir el carril informado. Una sobrevivió —tratar aparte una
  respuesta fuera de la lista— y no medía nada: esa rama se quitó.
- **Corrida real** de `/autobuild` en un banco fuera del árbol, motor congelado en `8a93c877`, tarea
  `umbral-envio-gratis [express]` sobre «Total del pedido» (USD 8,20). La fase `Surface` devolvió
  `"critical":"Total del pedido (app/src/order-total.js)"`, Review corrió y devolvió el mismo `critical`, y
  el hecho que recibió Done terminaba en `· toca la superficie crítica Total del pedido
  (app/src/order-total.js)`.
