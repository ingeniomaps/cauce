---
caso: 053
titulo: Una propuesta se archiva con «Responsable: por definir» y `HISTORY.md` vacío
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.70.0
---

# 053 — Archivar una propuesta no deja constancia de quién lo decidió ni por qué

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **media** — el informe siguiente no puede distinguir «se revisó» de «se ignoró»

## Resumen

Una propuesta mensual nace `pendiente`, se firma aprobando el PR que la lleva —ahí `sign-proposal.yml`
escribe «Estado», «Responsable» y «Fecha»— y se aplica con `agent-promote`, que registra el cambio en
`HISTORY.md`. Ese es el camino cuando se acepta.

Cuando se archiva no hay camino equivalente. La propuesta queda con `status: archived` y
`Estado: archivada`, pero **«Responsable» y «Fecha» siguen diciendo «por definir»**, y `HISTORY.md` no
recibe ninguna fila. O sea: se sabe que la propuesta no se aplicó, y no se sabe quién lo decidió ni con
qué criterio.

El costo lo pagan los informes siguientes, y ya lo pagaron. Dos cargos de la tanda del 2026-09-07
gastaron parte de su «Recomendación» en explicar el estado en vez de en su profesión, porque sin esa nota
el lector no puede distinguir una propuesta revisada y descartada de una que nadie miró.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

for cargo in product-manager mlops-engineer; do
  echo "── $cargo"
  grep -m4 -E '^(status:|- Estado:|- Responsable:|- Fecha:)' \
    "agents/roles/system/$cargo/learning/proposals/2026-09.md"
  echo "   filas en HISTORY.md: $(grep -cE '^\| *2[0-9]{3}-' "agents/roles/system/$cargo/learning/HISTORY.md")"
done
```

## Síntoma

```
── product-manager
status: archived
- Estado: archivada
- Responsable: por definir
   filas en HISTORY.md: 0
── mlops-engineer
status: archived
- Estado: archivada
- Responsable: por definir
   filas en HISTORY.md: 0
```

Y lo que eso provocó, del informe de `product-manager` del 2026-09-07:

> **Nota de estado sobre esa propuesta:** […] es decir, sus cinco ítems no fueron aplicados. […] Este
> informe no reabre esa propuesta ni decide si sus ítems siguen vigentes: lo deja constatado para quien
> prepare la próxima propuesta mensual, porque sin esta nota parecería que H1-H5 de agosto siguen
> «pendientes de revisar» cuando en realidad ya se revisaron y se archivaron.

El de `mlops-engineer` dedica su recomendación 1 a lo mismo, y aclara que lo hace «porque afecta si la
recomendación 3 de abajo es nueva o repetida».

## Causa raíz

- `.github/workflows/sign-proposal.yml` sólo actúa sobre `- Estado: pendiente`, y escribe responsable y
  fecha al aprobar. El camino de archivar no pasa por ahí.
- `engine/agents/learning-seal.js` (`seal`, `archive`) mueve el estado del documento. `HISTORY.md` lo
  escribe quien aplica, no quien archiva.

No es un defecto de una línea: es una salida del ciclo que quedó sin su registro. Aplicar y archivar son
las dos formas de cerrar una propuesta, y sólo una deja rastro.

## Fix propuesto

Que `archive` complete las mismas tres líneas que completa la firma, con quien archivó y cuándo, y que
`HISTORY.md` reciba una fila con decisión `archivada`:

```diff
 function archive(file) {
   ...
+  // Archivar es una de las dos formas de cerrar una propuesta, y hasta acá era la única sin registro:
+  // quedaba «Responsable: por definir» y ninguna fila en HISTORY.md, así que el informe siguiente no
+  // podía distinguir una propuesta descartada de una que nadie miró. Dos cargos lo escribieron a mano
+  // en su recomendación de septiembre.
+  sellarResponsable(file, quien, fecha)
+  registrarEnHistory(dir, { fecha, propuesta, decision: 'archivada', quien })
 }
```

La firma de quien archiva tiene el mismo problema que tenía la de quien aprueba —es texto libre— así que
conviene que salga de la misma fuente autenticada: el `login` de quien dispara la acción, no un nombre
escrito a mano.

## Tradeoffs

- Si `archive` se invoca desde un contexto sin identidad autenticada, la fila diría «por definir» igual y
  no se habría ganado nada. Hay que decidir de dónde sale el responsable antes de escribir el fix.
- `HISTORY.md` dice hoy «Registrar aquí únicamente cambios aprobados y aplicados al agente». Sumar filas
  de propuestas archivadas cambia lo que ese archivo es, y hay que reescribir su encabezado o llevar el
  registro a otro lado. **Esa decisión no está tomada acá.**
- Retro-rellenar las propuestas ya archivadas sería escribir de memoria una decisión que nadie registró.
  No corresponde: las de septiembre se quedan como están.

## Contexto de descubrimiento

Leyendo las «Recomendación» de los veinte informes del 2026-09-07 para clasificar cuáles proponían
cambios. Dos de ellos gastaban su recomendación en explicar este hueco.

## Relacionados

- Ninguno todavía.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró, contra el fix y los tres tradeoffs:

- **El fix propuesto se hizo, y con las tres líneas que pedía.** `archive` completa `- Responsable:` y
  `- Fecha:` en el documento, y agrega su fila al historial con decisión `archivada`. La celda del cambio
  no queda vacía: lleva el criterio que el propio comando declara —«se miró y no cambia nada»—, que es el
  único que este comando admite. Archivar por otra razón, como posponer, necesitaría un campo que no
  existe y sería otra funcionalidad.
- **Tradeoff «hay que decidir de dónde sale el responsable» — decidido, y con una limitación que hay que
  decir.** Sale de `owner()`: `CAUCE_OWNER` o `git config user.email`, la misma identidad con la que se
  reclama una tarea. **No es autenticada** —el caso pedía «el login de quien dispara la acción»— y en un
  CLI local no hay tal cosa: `git config` lo escribe cualquiera. Se acepta porque archivar no autoriza
  ningún cambio, a diferencia de firmar, así que suplantar a alguien acá no consigue nada que no se
  consiga borrando el archivo. Si `archive` llegara a correrse desde un workflow, ahí sí hay un login y
  conviene usarlo.
- **Tradeoff «el encabezado de `HISTORY.md` dice "únicamente cambios aprobados y aplicados"» — resultó
  falso como bloqueo, y verdadero como defecto aparte.** La tabla que esos archivos llevan debajo tiene
  una columna llamada **«Decisión»**, uniforme en 29 de los 53 cargos, y existe justamente porque hay más
  de una: `appendHistory` ya escribía `aplicada` ahí. Registrar `archivada` es para lo que se diseñó, así
  que **no hubo que reescribir ningún contrato**. Lo que sí apareció al mirarlo es que hay trece
  redacciones distintas de ese encabezado y que nueve contradicen a su propia tabla — sale como caso
  propio, **059**.
- **Tradeoff «retro-rellenar las archivadas de septiembre sería escribir de memoria» — se respetó.** Las
  dieciséis quedan como están. Lo que las arregla no es un barrido sino volver a archivarlas, y eso sólo
  tiene sentido si alguien las mira de nuevo.
- **El daño que el Resumen describía —«los informes siguientes gastan su recomendación explicando el
  estado»— queda cerrado en la fuente.** Un lector de la propuesta ve ahora quién la archivó y cuándo, así
  que no hace falta que el informe del mes siguiente lo aclare.

**Probado con el comando real**, no sólo con la suite: sobre una instancia recién creada,
`learn <cargo> --archived --period <p>` dejó `- Responsable: manuel@ingeniomaps.test`, `- Fecha:` con la
del día, y la fila `| 2026-09-09 | 2099-01.md | archivada | manuel@ingeniomaps.test | Se miró y no cambia
nada. |`. Las dos mutaciones —quitar el responsable, quitar la fila— enrojecen la prueba que les toca.

Lo que el caso no preveía y apareció al arreglarlo: **archivar dos veces no duplica la fila**, porque la
segunda vuelta sale antes por «ya estaba archivada». No estaba enunciado y se comprueba, porque un
historial que crece por reintentar es peor que uno vacío.
