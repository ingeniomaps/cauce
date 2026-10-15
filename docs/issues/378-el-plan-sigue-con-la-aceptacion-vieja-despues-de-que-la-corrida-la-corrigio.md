---
caso: 378
titulo: el plan sigue con la aceptación vieja después de que la corrida la corrigió
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.106.1
---

# 378 — Una corrida corrige un criterio de aceptación, el plan siguiente sigue escrito contra el criterio viejo, y la línea del backlog nunca recibe la corrección

**🟢 resuelto en 0.108.0** · detectado en 0.106.1 · prioridad **media** — era del recorrido: la corrección vivía sólo
en memoria y la línea de la tarea seguía diciendo lo viejo. Ahora se escribe ahí, se relee, y el replan recibe
la aceptación que rige.

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

## Cierre

**Resuelto en 0.108.0.** Las dos lecturas que el caso dejaba abiertas se resolvieron leyendo el recorrido, y la
que vale es la primera. `Ready` guardaba la aceptación corregida sólo en memoria (`task.acceptance =
ready.refinedAcceptance`), y `DECIDED()` le inyectaba al planificador la descripción de la línea de la tarea con la
orden de no re-decidirla: el planificador recibía las dos versiones y la que decía «no se re-decide» era la vieja.
Al parar la corrida, la corrección no quedaba en ningún lado. Y el replan ni siquiera recibía la aceptación:
sólo los motivos de la crítica y el plan.

**Lo que cambió.** Cuando `Ready` corrige, el recorrido escribe la corrección en la línea de la tarea, en el
archivo que `context` dice, y relee la cola; si la relectura sigue con la anterior, para con
`refine-not-applied`, igual que la partición con `split-not-applied`. La tarea sigue con lo releído, aceptación y
descripción. Y el replan recibe «La aceptación que rige es: …».

**Lo que se corrió para saber que funciona.**

- Arnés: `test/workflows/autobuild-queue.test.js`, «la aceptación que Ready corrige se escribe en la línea de la
  tarea y la corrida sigue con ella»: la escritura nombra la línea y el texto, el plan y el replan reciben la
  corregida, y con una relectura que sigue trayendo la vieja la corrida para en `refine-not-applied`. Tres
  mutaciones en copia, cada una en rojo: sin la escritura, sin la guarda de relectura, sin la aceptación en el
  replan.
- El paso real, solo: el prompt exacto de `refine` corrido con `claude -p` el 2026-10-14 sobre un banco con
  `T-1 … _Aceptación: uno visible._`. Quedó
  `_Aceptación: uno es visible y el registro dice quién lo vio._`, `check` en verde y `ops context --json`
  devolviendo esa aceptación.

**Lo que el caso no preveía.** El agente real escribió el texto pedido **y le agregó un punto final**. La guarda
de relectura comparaba textual, así que una escritura correcta se habría leído como «no ocurrió» y la corrida
habría parado. La comparación tolera puntuación final y espacios; una cuarta mutación, sin esa tolerancia, pone
en rojo la prueba que lleva el punto. Es lo que el arnés no puede ver y una corrida de un solo paso sí.

**Recorrido de lo que el caso enumeraba.**

- **Lectura (1), el recorrido no reescribe la línea — confirmada y arreglada.**
- **Lectura (2), el planificador ignoró lo que recibió — no era eso**, pero su fix también entró: el replan
  recibe el criterio corregido textual, porque no recibía ninguno.
- **Tradeoff, escribir la cola a mitad de corrida — aceptado.** Es la línea de la tarea que este runner tiene
  reclamada, en un archivo por hito desde el caso 212; la alternativa era perder la corrección.

**Revisión del PR 819.** Tres huecos en la guarda de relectura: no comprobaba que la cola siguiera ofreciendo la
misma tarea —una línea rota se leía como «sigue con la anterior»—, un `_` suelto en el texto corregido cierra la
aceptación en la línea y la relectura volvía cortada, y la primera crítica no recibía la aceptación que rige,
sólo el replan. Ahora la relectura exige la misma tarea y dice qué ofrece si no; un texto con `_` suelto para
antes de dictarse en `refine-unwritable`; y la primera crítica juzga «contra» la aceptación. Pruebas en el arnés;
tres mutaciones, una por guarda, en rojo.
