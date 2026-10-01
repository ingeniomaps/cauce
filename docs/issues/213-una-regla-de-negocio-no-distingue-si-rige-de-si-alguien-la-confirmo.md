---
caso: 213
titulo: una regla de negocio no distingue si rige de si alguien la confirmó
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 213 — `Estado` mezcla dos preguntas: si la regla rige y si alguien con autoridad confirmó que es correcta

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no rompe nada, pero un cargo que lee el código y escribe la regla la puede dejar
`vigente` describiendo un defecto como comportamiento correcto, y nada distingue esa regla de una que
alguien de negocio confirmó.

## Resumen

Una regla de negocio tiene un solo estado —`propuesta`, `vigente`, `derogada`— que contesta si rige.
No hay dónde decir si alguien con autoridad confirmó que lo que describe es lo que debería pasar, ni dónde
dejar escrito que negocio no está de acuerdo con lo que el sistema hace. Son dos preguntas con vidas
distintas: una regla puede regir hoy y no estar confirmada, y una discrepancia no se resuelve editando la
regla, porque la regla describe lo que el sistema hace hasta que el sistema cambie.

## Reproducción

```bash
sed -n 16p engine/planning/business-rules.js
sed -n 3p template/planning/business-rules/000-template.md
```

## Síntoma

```
const STATES = ['propuesta', 'vigente', 'derogada']
> **Dominio:** nombre | **Estado:** propuesta | vigente | derogada | **Actualizado:** YYYY-MM-DD
```

No hay campo de verificación ni de quién confirmó.

## Causa raíz

`engine/planning/business-rules.js:16` y la cabecera de `000-template.md`: un solo eje.

## Fix propuesto

Decidido con Manuel el 2026-10-01 (idea E del plan de adopción).

1. La cabecera suma `> **Verificación:** propuesta | ratificada | discrepancia`, independiente del estado.
2. `ratificada` exige `> **Confirmada por:** <nombre>, <rol>, <fecha>, autoridad propia`. Quien sólo
   retransmite lo que leyó en un ticket o un documento no ratifica: es el testimonio y no el trámite.
3. `discrepancia` exige `> **Pregunta abierta:** <qué debería pasar> (decide: <quién>)`. La regla no se
   edita para que diga lo que debería: sigue describiendo lo que hay.
4. Las reglas que ya existen no se cortan (R9): sin `Verificación`, `check` avisa. Un valor fuera del
   vocabulario, o una ratificada o una discrepancia sin su línea, es error.

## Tradeoffs

- Un aviso por regla existente hasta que se le declare la verificación.
- Más ceremonia al escribir una regla nueva.

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: su catálogo separa vigencia de verificación
(`dropi-business-rules/FORMATO.md:413-425`), ratifica sólo con autoridad propia
(`plantillas/regla.yaml:45-58`) y trata la discrepancia como hallazgo y no como edición (`FORMATO.md:457-468`).

## Relacionados

- 208 — el otro cambio a la cabecera de una regla de negocio.

## Cierre

Recorrido contra el caso entero:

- **Fix 1, `Verificación` en la cabecera** → se hizo.
- **Fix 2, `ratificada` exige autoridad propia** → se hizo: una confirmación que no dice «autoridad propia» es
  error.
- **Fix 3, `discrepancia` exige la pregunta abierta** → se hizo.
- **Fix 4, las reglas existentes no se cortan** → se hizo: sin el campo, aviso.
- **Tradeoff, un aviso por regla existente** → aceptado. Las reglas del sistema del molde (`BR-OPS-001` a
  `005`) se declararon `ratificada` por sus mantenedores, así que ninguna instancia recibe avisos por ellas.
- **Tradeoff, más ceremonia** → aceptado.

**Probado corriendo.** `check` del molde pasa limpio con las reglas del sistema ratificadas. Arnés: dos
casos en `test/planning/contracts.test.js`, uno sobre el módulo y otro por `check` en una instancia creada con
`init`. Mutaciones vistas en rojo: sin aviso, vocabulario abierto, ratificar sin autoridad, discrepancia sin
pregunta y `check` sin cablear.
