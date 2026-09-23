---
caso: 179
titulo: Una propuesta descartada no dice por qué, y el informe semanal siguiente la vuelve a recomendar sin saber que ya se contestó
estado: resuelto
resuelto-en: 0.98.0
prioridad: media
version-detectada: 0.97.0
---

# 179 — Lo descartado vuelve cada lunes porque nadie escribió que se descartó

**🟢 resuelto en 0.98.0** · detectado en 0.97.0 · prioridad **media**. El motivo queda en la propuesta, y
el informe semanal siguiente lo trae antes de su primera sección.

## Resumen

`ops learn <cargo> --archived` cierra una propuesta sin aplicarla y no deja escrito ningún motivo. El
historial dice «Se miró y no cambia nada», que no explica por qué. El informe semanal siguiente se
escribe sin ver esa decisión, así que un hallazgo que alguien ya miró y descartó vuelve a recomendarse
cada semana, con el mismo texto y con `propone: si`. Cada lunes cuesta una revisión humana, y nada lo
distingue de un hallazgo nuevo.

## Reproducción

En un banco de medición (`node engine/cli/ops.js bench suelto`), con un cargo forkeado:

1. `node tools/ops.js agents fork qa-engineer`
2. Escribir un informe `learning/reports/2026-09-07.md` con una recomendación, y consolidarlo:
   `node tools/ops.js learn qa-engineer --proposal --period 2026-09`.
3. Llenar el «Cambio propuesto» de la propuesta, para que decida algo.
4. Descartarla con motivo: `node tools/ops.js learn qa-engineer --archived --reason "ya cubierto"`.
5. Descartarla sin motivo: `node tools/ops.js learn qa-engineer --archived`.
6. Abrir el informe siguiente: `node tools/ops.js learn qa-engineer`, y buscar en él la decisión.

## Síntoma

Salida real, sobre 0.97.0, el 2026-09-22:

```
--- archivar con motivo:
learn: bandera desconocida --reason. Acepta: --flow, --proposal, --applied, --archived, --period.
exit=2
--- archivar:
✓ agents/roles/qa-engineer/learning/proposals/2026-09.md queda archivada: se miró y no cambia nada
exit=0
## Aprobación humana

- Estado: archivada
- Responsable: banco@cauce.local
- Fecha: 2026-09-23
| 2026-09-23 | `2026-09.md` | archivada | banco@cauce.local | Se miró y no cambia nada. |
--- informe siguiente:
coincidencias=0
```

El informe nuevo no nombra la propuesta, el motivo ni el cambio descartado.

En producción se ve en la tanda del lunes 2026-09-21. El enlace a NIST AI 600-1 de ai-product-manager
se recomendó por cuarta semana seguida. El pricing de Gemini de finops-engineer, por tercera. El Decreto
15-2026 de kyc-aml-specialist volvió después de que `2026-09-r2.md` se archivara el 2026-09-14.

## Causa raíz

- **`engine/agents/learning-seal.js`, `archive()`** no recibía ningún motivo. La celda del historial era
  fija: «Se miró y no cambia nada» o «Se archivó sin decidir».
- **`engine/cli/args.js`** no aceptaba ninguna bandera para darlo.
- **`engine/agents/learning.js`, `prepareReport()`** arma el informe sin mirar `learning/proposals/`.
  El prompt de la investigación (`agent-learning.yml`, paso «Research») tampoco la menciona, así que
  nada le decía al cargo que su recomendación ya tenía respuesta.

## Fix propuesto

1. `archive(root, agent, period, kind, reason)`. Si el «Cambio propuesto» decide algo y no hay motivo,
   se niega. El motivo se escribe como `- Motivo:` en «Aprobación humana» y va a la fila del historial
   como `Descartada: <motivo>`.
2. `--reason` en `learn`, como bandera con valor.
3. `discardedProposals(dir)` lista las propuestas `archived` que tienen motivo. `prepareReport` las
   escribe en un comentario antes de la primera sección, con la instrucción de no volver a recomendarlas
   salvo que aparezca un hecho nuevo.

## Tradeoffs

- **Archivar una propuesta decidida sin `--reason` deja de funcionar.** Es un cambio de comportamiento
  del CLI y lo avisa el CHANGELOG. Se acepta porque el motivo es justamente lo que hace falta, y el error
  dice qué agregar.
- **Una propuesta con el molde intacto sigue archivándose sin motivo, y sus hallazgos siguen vivos.** Es
  lo que pasó con las siete del 2026-09-14. Que vuelvan es correcto, porque nadie los contestó. Quien sí
  los miró puede pasar `--reason` igual, y desde ahí cuentan como descartados.
- **El aviso es un comentario, no una puerta.** Nada impide que el modelo recomiende igual lo
  descartado. Ponerlo en el archivo que tiene que completar es lo más cerca que llega el motor sin un
  juez aparte.

## Prioridad

Media. No rompe nada, pero gasta una revisión humana por cargo y por semana, y acostumbra a leer los
informes en diagonal.

## Contexto de descubrimiento

Revisando la tanda semanal del 2026-09-21: 17 PR, de los cuales 8 tenían `propone: si`. Al leer sus
recomendaciones, cuatro repetían las de semanas anteriores. La pregunta fue por qué algo que ya se
propuso se vuelve a proponer.

## Relacionados

- **053**: archivar dejaba el documento sin decisión. Ese caso agregó quién y cuándo; este agrega por qué.
- **142**: una propuesta firmada con el molde intacto no se podía cerrar. De ahí salen los archivados
  «sin decidir» que este caso deja vivos a propósito.

## Cierre

**Resuelto en 0.98.0, por el camino que el caso propone.** Recorriendo lo que enumeró:

- **`archive` recibe el motivo y lo exige sobre lo decidido → se hizo.** Queda en el documento y en el
  historial.
- **`--reason` en el CLI → se hizo.** Se registró también como bandera con valor. Sin eso, `parse` toma el
  motivo como argumento posicional, y la bandera llega vacía aunque se haya escrito.
- **El informe siguiente lo lee → se hizo.** Va en un comentario fuera de toda sección, porque dentro de
  «Recomendación» viajaría a la propuesta mensual como si fuera un hallazgo.
- **Tradeoff del archivado sin decidir → decidido: no se lista.** Una prueba cuida que no aparezca como
  descartado.
- **Documentación → se hizo.** Una fila en la tabla de comandos del `README.md`, el uso en `ops.js` y la
  entrada del CHANGELOG.

Y lo que apareció arreglándolo: el análisis de la tanda mostró que casi toda la repetición salía de
propuestas archivadas **sin decidir**, no de rechazos. Para esas, este cambio no reduce la repetición: la
hace legítima. Qué hacer con la cadencia semanal es otra decisión, y la tomó el caso 182.

### Qué se corrió

- **La reproducción de arriba, con el arreglo puesto**, en el mismo banco:

  ```
  --- sin motivo:
  2026-09.md decide un cambio: descartarlo pide --reason "<por qué no va>". El motivo es lo que evita que el próximo informe lo vuelva a recomendar.
  exit=2
  --- con motivo:
  ✓ agents/roles/qa-engineer/learning/proposals/2026-09.md queda archivada: descartada — Playwright ya lo cubre la fuente del proyecto; una segunda entrada duplica
  exit=0
  - Estado: archivada
  - Motivo: Playwright ya lo cubre la fuente del proyecto; una segunda entrada duplica
  | 2026-09-23 | `2026-09.md` | archivada | banco@cauce.local | Descartada: Playwright ya lo cubre la fuente del proyecto; una segunda entrada duplica |
  --- informe siguiente:
  <!-- Ya se decidió no aplicar estas propuestas. [...]
    · learning/proposals/2026-09.md: Playwright ya lo cubre la fuente del proyecto; una segunda entrada duplica
  ```

- **Cuatro mutaciones, en una copia del árbol, las cuatro en rojo**:
  - Quitar la exigencia del motivo pone en rojo «descartar un cambio decidido exige el motivo…».
  - Sacar el aviso de `prepareReport` pone en rojo «el informe siguiente trae lo descartado…».
  - Contar como descartado un archivado sin motivo pone en rojo la misma prueba, en su aserción de
    ausencia.
  - No escribir `- Motivo:` pone en rojo las dos.
