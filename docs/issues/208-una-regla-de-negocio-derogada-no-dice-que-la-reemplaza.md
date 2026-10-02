---
caso: 208
titulo: una regla de negocio derogada no dice qué la reemplaza
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 208 — `check` acepta una regla `derogada` sin reemplazo ni razón de baja

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no rompe nada hoy, pero una épica o un ADR que cita `[fuente: BR-…]` sobre una
regla derogada queda apuntando a algo que ya no rige y sin forma de saber qué la reemplazó. Es R25
—el identificador de una unidad viva no cambia, y cuando cambia el nuevo lleva el viejo al lado— sin
equivalente para las reglas de negocio.

## Resumen

Los estados de una regla de negocio son `propuesta`, `vigente` y `derogada`. Derogar no exige decir
qué la reemplaza ni por qué se dio de baja, y `check` no lo pide.

## Reproducción

Sobre un banco desechable (`node engine/cli/ops.js bench suelto` →
`.cauce-eval/_medicion/suelto`), se agrega `planning/business-rules/pagos/conciliacion.md` con la
plantilla completa y `**Estado:** derogada`, sin ninguna línea de reemplazo, y se corre:

```bash
node tools/ops.js check planning
```

Control, para comprobar que `check` sí lee ese archivo: el mismo archivo con `**Estado:** rota`.

## Síntoma

Con `derogada`:

```
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
```

Con `rota` (control):

```
✗ business-rules/pagos/conciliacion.md: Estado «rota» no es propuesta, vigente, derogada

1 error(es), 0 advertencia(s)
```

## Causa raíz

`engine/planning/business-rules.js:16` —`STATES`— valida el estado contra el conjunto cerrado y no
pide nada más según cuál sea. `template/planning/business-rules/000-template.md:3` no tiene dónde
escribir el reemplazo.

## Fix propuesto

1. La plantilla suma, para el estado `derogada`, una línea `**Reemplazada por:** BR-…` o
   `**Razón de baja:** …`.
2. `check` exige una de las dos en las reglas derogadas, y valida que el `BR-` citado exista en el
   registro.
3. **Las reglas derogadas que ya existen no se cortan** (R9, deprecar antes de cortar): para ellas
   `check` avisa, diciendo qué falta y desde qué versión pasa a error; para las nuevas, error. Cómo
   distinguir una de otra —por fecha de `Actualizado`, o aviso para todas durante una versión— se
   decide al mejorar el caso.

**Decidido al implementarlo**, distinto del punto 3: la falta **avisa siempre**, también en las reglas
nuevas. Distinguir una vieja de una nueva por la fecha de `Actualizado` es frágil —se toca la fecha al
editar cualquier cosa— y un aviso permanente ya se ve en cada `check`. Lo que sí es error es lo que se
escribe mal: un `Reemplazada por:` que cita un identificador que no existe, o uno del mismo archivo, que
quedó derogado con ella —este borde apareció al probarlo en el banco—.

## Tradeoffs

- Una instancia con reglas derogadas viejas ve avisos nuevos en el `upgrade`. Es el costo de no
  romperle `check`.
- Validar que el reemplazo exista obliga a que la regla nueva esté escrita antes de derogar la vieja,
  que es el orden correcto pero puede sorprender.

## Contexto de descubrimiento

Revisión de los repositorios de Wonka del 2026-10-01: su catálogo de reglas de negocio lleva el vínculo
en las dos direcciones (`reemplaza_a` / `reemplazada_por`) y nunca reutiliza un identificador
(`wonka-business-rules/plantillas/regla.yaml:65-72`, `FORMATO.md:139`).

## Relacionados

- R25 — la misma idea para las unidades de trabajo.

## Cierre

Recorrido contra el caso entero:

- **Fix 1, la plantilla dice dónde escribirlo** → se hizo, en `000-template.md`.
- **Fix 2, `check` lo exige y valida el `BR-` citado** → se hizo distinto: la falta avisa y la cita mal
  escrita es error (decisión escrita arriba).
- **Fix 3, no cortar las que ya existen** → se hizo por la vía del aviso, para todas.
- **Tradeoff, avisos nuevos en el `upgrade`** → aceptado.
- **Tradeoff, el reemplazo tiene que existir antes** → aceptado; es el orden correcto.
- **Lo que el caso no preveía:** una regla que dice que la reemplaza un identificador de su propio archivo
  pasaba; ahora es error.

**Probado corriendo.** En un banco, la regla derogada sin reemplazo da `⚠ … está derogada y no dice qué rige
en su lugar` con `check` en verde; con `BR-PAG-777` da `✗ … que no existe` y sale 1; con un reemplazo propio
da `✗ … está en el mismo archivo`; con un reemplazo válido o una razón de baja, verde. Arnés:
`test/planning/contracts.test.js`, dos casos; las cinco mutaciones —sin aviso, razón de baja ignorada, cita
rota aceptada, auto-reemplazo aceptado y `check` sin cablear— se vieron en rojo.
