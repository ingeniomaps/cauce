---
caso: 053
titulo: Una propuesta se archiva con «Responsable: por definir» y `HISTORY.md` vacío
estado: abierto
prioridad: media
version-detectada: 0.70.0
---

# 053 — Archivar una propuesta no deja constancia de quién lo decidió ni por qué

**🔴 abierto** · detectado en 0.70.0 · prioridad **media** — el informe siguiente no puede distinguir «se revisó» de «se ignoró»

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
