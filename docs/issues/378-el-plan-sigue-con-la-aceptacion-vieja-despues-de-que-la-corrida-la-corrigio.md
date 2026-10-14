---
caso: 378
titulo: el plan sigue con la aceptación vieja después de que la corrida la corrigió
estado: abierto
prioridad: media
version-detectada: 0.106.1
---

# 378 — Una corrida corrige un criterio de aceptación, el plan siguiente sigue escrito contra el criterio viejo, y la línea del backlog nunca recibe la corrección

**🔴 abierto** · detectado en 0.106.1 · prioridad **media** · **sin confirmar**: lo de abajo sale del texto del
rechazo que dejó la corrida, no de leer su salida completa. Puede ser un defecto del recorrido o un plan que
ignoró lo que recibió; distinguirlo pide leer la corrida.

## Resumen

En la tarea `cuenta-sesion-altas-de-investigacion-y-retiro-del-puente`, el criterio (1) comprobaba el retiro de
un módulo con `grep -rn accountIdOfBrand src scripts`. Ese grep también encuentra una prueba de guardia que debe
quedarse (`src/lib/integraciones/almacen.test.ts`, líneas 112-116, nombra el identificador sin paréntesis). La
corrida corrigió el criterio a `grep -rnE 'accountIdOfBrand\(|@/lib/brand/accountOfBrand' src scripts`, que no
encuentra la guardia. Pero el plan siguiente siguió con el grep viejo y reescribía la guardia, y la crítica lo
rechazó por eso. La tarea paró en `plan-rejected` y la línea del backlog quedó con el grep viejo.

## Reproducción

Corrida de autobuild `wf_1412ea67-dd0` en la instancia sidecar `acme-ops`. El rechazo final quedó escrito
en `planning/human/cuenta-sesion-altas-de-investigacion-y-retiro-del-puente.md` (commit `f973ebd`):

> El plan contradice el criterio (1) corregido. La aceptación ahora se comprueba con
> `grep -rnE 'accountIdOfBrand\(|@/lib/brand/accountOfBrand' src scripts` y dice textualmente que la guardia
> de `src/lib/integraciones/almacen.test.ts` «queda como está y la búsqueda no la encuentra». El plan, en
> cambio, sigue con el grep viejo `grep -rn accountIdOfBrand src scripts` (en el approach, en el paso 14 y en
> la testStrategy del criterio 1) y su paso 2 reescribe esa guardia.

La línea de la tarea en `planning/backlog/cuenta-como-ancla.md` seguía, en ese mismo commit, con
`grep -rn accountIdOfBrand src scripts`.

## Síntoma

- Dos rechazos de plan sobre la misma dimensión, y la tarea en `plan-rejected`.
- La corrección del criterio no sobrevive a la corrida: quien relance la tarea arranca otra vez con el
  criterio que ya se había visto que estaba mal.

## Causa raíz

Sin establecer. Dos lecturas posibles:

1. **El recorrido**: la corrección vive en un lugar que el planificador no lee (o lee después que la versión
   del backlog), y no se escribe de vuelta en la línea de la tarea.
2. **El planificador**: recibió el criterio corregido y lo ignoró.

## Fix propuesto

Si es (1): cuando una fase corrige la aceptación, escribirla en la línea del backlog en el mismo paso, y que
el plan la lea de ahí. Si la corrida para después, la corrección queda donde la va a leer la siguiente.

Si es (2): que la crítica, al rechazar por divergir del criterio, le pase al replan el criterio corregido
textual, no sólo la descripción de la divergencia.

## Qué podría salir mal

- Escribir la aceptación en el backlog durante una corrida es tocar el estado compartido a mitad de camino;
  con varios runners puede chocar con otra edición del mismo archivo de hito.

## Contexto de descubrimiento

Instancia sidecar `acme-ops`, 2026-10-14. La tarea se partió a mano en dos (`1321b28`), con el grep
corregido en la parte que retira el módulo.

## Relacionados

- [081](./081-un-plan-rechazado-dos-veces-no-vuelve-a-las-compuertas-que-lo-dejaron-pasar.md)
- [177](./177-la-descripcion-de-la-tarea-no-viaja-a-ninguna-fase-y-el-plan-vuelve-a-decidir.md)
- [376](./376-partir-una-tarea-deja-a-quien-dependia-de-ella-apuntando-a-un-slug-que-ya-no-existe.md) y
  [377](./377-el-escriba-commitea-el-estado-de-planning-sin-el-scope-del-proyecto.md) — misma corrida.
