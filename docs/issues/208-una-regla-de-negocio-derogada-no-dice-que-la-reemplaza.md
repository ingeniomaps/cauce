---
caso: 208
titulo: una regla de negocio derogada no dice qué la reemplaza
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 208 — `check` acepta una regla `derogada` sin reemplazo ni razón de baja

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

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

## Tradeoffs

- Una instancia con reglas derogadas viejas ve avisos nuevos en el `upgrade`. Es el costo de no
  romperle `check`.
- Validar que el reemplazo exista obliga a que la regla nueva esté escrita antes de derogar la vieja,
  que es el orden correcto pero puede sorprender.

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: su catálogo de reglas de negocio lleva el vínculo
en las dos direcciones (`reemplaza_a` / `reemplazada_por`) y nunca reutiliza un identificador
(`dropi-business-rules/plantillas/regla.yaml:65-72`, `FORMATO.md:139`).

## Relacionados

- R25 — la misma idea para las unidades de trabajo.
