---
caso: 228
titulo: Jira: reset y reconcile no protegen lo promovido
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 228 — `integration reset` y `reconcile` corren sobre un ítem ya promovido

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: deshacen una decisión humana —la promoción— sin pedirla.

## Resumen

`reset` no restringe por estado y `reconcile` no se niega sobre un ítem promovido. acme-ops limita `reset` a `pending`/`context` y hace que `reconcile` se niegue sobre `promoted`.

## Reproducción

Pendiente al tomar el caso: en un banco, sincronizar, promover un ítem y correr `integration reset` sobre él.

## Síntoma

Un ítem promovido vuelve a pendiente y su vínculo con el roadmap queda suelto.

## Causa raíz

`engine/integrations/state.js:176-215`, según la lectura del relevamiento; se contrasta al tomar el caso.

## Fix propuesto

Dos comprobaciones en `state.js`, con el motivo en el mensaje.

## Tradeoffs

- Ninguno conocido: es cerrar una salida que nadie debería usar sin decidirlo.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/integrations/jira/sync-state.js:259-309`.

## Relacionados

- 226 — la misma integración.

## Cierre

Resuelto en 0.100.0.

- **Reproducción, antes de tocar nada:** con el motor de `main`, una épica promovida cuya incidencia cambió
  en Jira daba `diverged: true`. Un `reconcile` la dejó en `false` —la señal se perdió—, y un `reset` dejó el
  draft en `state: pending` con `promotedAt` vacío. Las citas de `engine/integrations/state.js` coincidían.
- **Dos comprobaciones en `state.js`, con el motivo en el mensaje** — se hizo, en `reconcile`. Sobre un ítem
  promovido, `reset` y `reconcile` se niegan antes de escribir nada, nombran la clave, dicen qué perderían y
  mandan a revisar la épica en `planning/roadmap/`. También en lote, sin claves. `rebase` sigue pasando:
  sólo recalcula el hash y no toca ni el estado ni la base.
- **Se hizo distinto de acme en un punto:** acme limita `reset` a `pending` y `context`. Acá se niega sólo
  sobre `promoted`. Resetear un `ready` o un `rejected` es justamente para lo que existe el comando, y no
  deshace ninguna decisión ya escrita en el roadmap.
- **Tradeoff: ninguno conocido** — se mantiene. La salida para un ítem promovido que cambió es la épica, que
  es donde vive la decisión.

Lo que se llevó puesto, como pide R9 para una quita:

- **`test/wiring/wiring.test.js` usaba `reconcile` y `reset` sobre un ítem promovido** para comprobar que el
  despachador del CLI tuviera las tres operaciones. Ahora comprueba que `rebase` pasa y que las otras dos se
  niegan nombrando el ítem. Para la rama que borra lo que se fue del remoto, devuelve el draft a `pending` a
  mano, como la misma prueba ya hacía con la promoción interrumpida.

Prueba real:

- **El escenario entero por el CLI**, en un banco `suelto` con el motor de esta rama: `integration sync`,
  `integration promote` (`✓ jira:DEMO-9 promovido como epic`), otro sync con la incidencia cambiada, y:

  ```
  DEMO-9 ya se promovió: reconcile borraría la señal de que Jira cambió después de promoverlo. Si Jira
  cambió, revisá la épica en planning/roadmap/ y reflejalo ahí.
  exit=1
  DEMO-9 ya se promovió: reset lo devolvería a pending y perdería el registro de la promoción. …
  exit=1
  ```

  El draft siguió en `state: promoted`.
- **Cuatro mutaciones en una copia, cada una en rojo por `test/wiring/jira-promoted.test.js`:**
  - Sin protección.
  - Sólo protege `reset`.
  - En lote no protege.
  - Protege lo que no está promovido.
