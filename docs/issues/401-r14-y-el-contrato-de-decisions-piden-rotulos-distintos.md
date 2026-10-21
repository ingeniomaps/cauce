---
caso: 401
titulo: R14 pide rotular verificado, documentado o hipótesis, y el contrato de decisions de DONE sólo acepta [fuente:] o [supuesto:]
estado: resuelto
resuelto-en: 0.112.0
prioridad: baja
version-detectada: 0.111.0
---

# 401 — Dos partes del sistema le piden al mismo texto rótulos distintos: R14 nombra tres registros y `check` exige otros dos literales en `decisions:`

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **baja**. Quien sigue R14 al pie escribe una bitácora que `check`
rechaza, y quien sigue el contrato escribe un registro que R14 no reconoce.

## Resumen

`rules/system/conduct.md` → R14 manda declarar cada afirmación de mecanismo en uno de tres registros:
**Verificado**, **Documentado** o **Hipótesis**. El contrato de DONE exige que `decisions:` cite
`[fuente: …]` o `[supuesto: …]`, y rechaza cualquier otra forma. Ninguno de los dos textos menciona al otro ni dice
cómo se traduce uno al otro.

## Reproducción

```
$ grep -n "Verificado\*\*\|Documentado\*\*\|Hipótesis\*\*" template/planning/rules/system/conduct.md
105:- **Verificado** — …
107:- **Documentado** — …
109:- **Hipótesis** — …
$ grep -n "DECISION_TRACE\|decisions debe" engine/planning/contracts.js
11:const DECISION_TRACE = /\[(?:fuente|supuesto):\s*[^\]]+\]/i
81:    errors.push(`${at}: decisions debe citar [fuente: ...] o [supuesto: ...]`)
```

Una bitácora con `decisions: Verificado — <salida>` falla con `decisions debe citar [fuente: ...] o [supuesto: ...]`.

## Causa raíz

`engine/planning/contracts.js:11`, aplicado en `:36-39` y `:80-81`, y R14 en
`template/planning/rules/system/conduct.md:105-110` se escribieron por separado.

## Fix propuesto

**Recomendado: la segunda, escrita en `template/planning/PROTOCOL.md:41`**, que es donde el contrato de `decisions:`
ya está documentado, y no en R14. La equivalencia es del contrato y no de la regla: R14 rige cualquier afirmación, y un
párrafo más en `rules/system/` mueve el peso de las reglas que recibe cada empresa (la prueba de KB se pone en rojo a
propósito). Las dos opciones:

- que el contrato acepte también los tres rótulos de R14 (`Verificado:`, `Documentado:`, `Hipótesis:`) como trazas
  válidas; o
- que R14 diga que en `decisions:` el registro se escribe como `[fuente: …]` (verificado o documentado) o
  `[supuesto: …]` (hipótesis).

La aceptación pide la mutación: con la equivalencia quitada, la prueba con una decisión rotulada a la R14 falla.

## Tradeoffs

- Ampliar el contrato afloja un formato que hoy es un literal fácil de buscar.

## Contexto de descubrimiento

Revisión mensual del INBOX de una instancia real, el 2026-10-19 (`[<instancia>][rotulo-de-r14-choca-con-el-contrato-de-decisions]`).

## Cierre

**Resuelto en 0.112.0**, por la segunda opción y en dos lugares que no son R14: el contrato donde ya vive
(`template/planning/PROTOCOL.md`, la línea de `decisions:`) dice que `[fuente: ...]` y `[supuesto: ...]` son los
registros de R14 escritos como cita, y el error de `check` (`engine/planning/contracts.js`) lo repite donde lo lee
quien se equivocó: «decisions debe citar [fuente: ...] o [supuesto: ...]. Con los registros de R14: lo verificado o
documentado va como [fuente: <qué se corrió o se citó>], y una hipótesis como [supuesto: <qué falta>].».

El enunciado, ítem por ítem:

- **Primera opción, que el contrato acepte `Verificado:`, `Documentado:` e `Hipótesis:`**: se decidió que no. Un
  rótulo solo no dice de dónde sale lo afirmado, y la cita sí lo pide; aflojarlo además dejaría dos formas para lo
  mismo en registros que `ops evidence` y `check` leen.
- **Segunda opción, decir la equivalencia**: se hizo, en `PROTOCOL.md` y en el error, no en R14. Un párrafo más en
  `rules/system/` mueve el peso de las reglas que recibe cada empresa, y la equivalencia es del contrato de DONE,
  no de la regla, que rige cualquier afirmación.
- **«Decirlo en los dos lugares»**: se hizo distinto. Los dos lugares son la documentación del contrato y el error
  que lo hace cumplir, que es donde se encuentra el choque. R14 no cambia.
- **La mutación**: la prueba nueva se vio roja con el mensaje de antes (`actual: [ 'DONE.md demo: decisions debe
  citar [fuente: ...] o [supuesto: ...]' ]`), que es la mutación de quitar la equivalencia.
- **Tradeoff de aflojar un literal**: no aplica, el formato no cambió.

**Lo que se corrió para saber que funciona.**

- `test/planning/evidence.test.js`: una decisión rotulada a la R14 (`Verificado — …`) no es traza válida, y la
  entrada con `Hipótesis — …` devuelve el error con la equivalencia. Roja antes del cambio, como arriba.
- Real, `ops check` sobre `ops bench suelto` con una entrada de `done/` que dice `decisions: Hipótesis — la ventana
  del MVP es de 72h`: con el motor de `main` sale 1 con el error de antes; con el de la rama sale 1 con el error que
  nombra la equivalencia. Reescrita como el error indica —`la ventana del MVP es de 72h [supuesto: nadie la
  confirmó]`—, `check` sale 0 y no menciona `decisions`.
