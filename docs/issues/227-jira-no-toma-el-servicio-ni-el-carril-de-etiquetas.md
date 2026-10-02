---
caso: 227
titulo: Jira no toma el servicio ni el carril de etiquetas
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 227 — El servicio de un ítem de Jira sale sólo de `components`, y el carril no sale de ningún lado

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: los proyectos team-managed de Jira no tienen componentes, así que ahí el servicio queda vacío.

## Resumen

La integración toma el servicio de `components`. acme-ops lo toma de una etiqueta `service:<dir>` (con componente y etiqueta a la vez como error) y el carril de una etiqueta `lane:` validada contra los carriles del motor.

## Reproducción

Pendiente al tomar el caso: el fixture con `labels: ["service:app"]` y sin componentes; se espera que `promote` escriba la historia sin `(service: …)`.

## Síntoma

En un proyecto team-managed cada historia promovida llega sin servicio y `check` la rechaza.

## Causa raíz

`engine/integrations/state.js:115`: el servicio sale sólo de `components`. Los carriles viven en `engine/planning/parser.js:30` y `promote` no escribe ninguno.

## Fix propuesto

`serviceFrom: "component"|"label"|"both"` y `serviceLabelPrefix` en la config; `laneLabelPrefix` para escribir `[lane]` en la línea de la tarea, con más de una etiqueta o una inválida como error.

## Tradeoffs

- El fixture de prueba ya trae `lane:full`: el dato existe y hoy se ignora.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/integrations/jira/services.js` y `promotion.js`.

## Relacionados

- 226 — la misma integración.

## Cierre

Resuelto en 0.100.0 para el servicio. El carril se decidió que no.

- **`serviceFrom: "component"|"label"|"both"` y `serviceLabelPrefix`** — se hizo, en `serviceOf`
  (`engine/integrations/state.js`). Sin `serviceFrom` sigue siendo componente, como hasta hoy. Con `both`,
  componente y etiqueta cuentan juntos: el mismo servicio por los dos lados es uno, y dos distintos dejan el
  servicio vacío con «Nombra más de un servicio (app, web): debe quedar uno solo». La opción que el caso
  proponía, que componente y etiqueta a la vez sean error, se hizo distinto: sólo es un problema si nombran
  servicios distintos. El prefijo viaja en el snapshot junto con `serviceFrom`, así que `reset` y `rebase`
  rearman el draft igual.
- **`laneLabelPrefix` para escribir `[lane]` en la tarea** — se decidió que no. `promote` escribe historias de
  épica, y en el contrato de Cauce una historia no lleva carril: lo lleva la tarea del BACKLOG, que promueve
  una persona. La etiqueta no tiene dónde ir sin cambiar ese contrato, y la decisión de carril es de quien
  arma la tarea. Si un día `promote` escribe tareas, el carril entra ahí.
- **Tradeoff: el fixture ya trae `lane:full`** — sigue ahí, sin uso, por lo de arriba.

Lo que el caso no preveía:

- **`serviceFrom` no se validaba.** Un valor mal escrito, como `"etiqueta"`, se aceptaba y dejaba todos los
  ítems sin servicio, con el draft culpando a la incidencia. Ahora `integration check` lo rechaza, y también
  un `serviceLabelPrefix` vacío.

Prueba real:

- **La reproducción**, con el motor de `main`: un ítem con `labels: ["service:app"]`, sin componentes, y
  `serviceFrom: "label"` daba `service: ""` y «Debe definirse un servicio único», y `serviceFrom: "etiqueta"`
  pasaba la validación sin errores.
- **El recorrido entero por el CLI**, en un banco `suelto` con el motor de esta rama: `integration sync` de una
  épica team-managed con `service:app` dejó `service: "app"` en el draft. Marcada `ready`, `integration
  promote` dijo `✓ jira:DEMO-9 promovido como epic` y escribió `service: app` en
  `roadmap/epic-001-mostrar-el-ultimo-sync.md`. `check` salió `✓ planning válido: 1 épica(s)`. El primer
  `promote` se negó porque `app` no existía bajo la raíz del banco, que es la comprobación que tenía que
  hacer.
- **Cinco mutaciones en una copia, cada una en rojo por `test/wiring/jira-labels.test.js`:**
  - No leer etiquetas.
  - Elegir uno de dos servicios.
  - El prefijo no viaja en el snapshot.
  - Sin validar `serviceFrom`.
  - `label` mira componentes.
