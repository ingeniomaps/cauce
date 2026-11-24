---
caso: 563
titulo: preguntar antes de intentar un paso que un guard cuida pide dos confirmaciones
estado: resuelto
resuelto-en: 0.125.0
prioridad: media
version-detectada: 0.124.0
---

# 563 — Preguntar «¿empujo?» antes de correr el comando hace que el sí no apruebe nada

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **media**: cualquier instancia con los guards de Cauce paga la vuelta doble, y es la conducta que el canal de chat espera sin que ninguna regla la escriba.

## Resumen

El canal de chat (`engine/hooks/chat.js`) aprueba lo que está frenado y esperando: el mensaje siguiente que no pregunta ni niega lo deja pasar. Un sí dicho antes de que haya algo frenado no aprueba nada. Si el agente pregunta primero, el guard frena igual y pide el mismo sí otra vez.

## Reproducción

Con el arnés del canal de chat (el hook y el registro reales, sin modelo): un «sí», un `git push origin feat/x`, otro «sí», el mismo push.

## Síntoma

```
modo plan:  1. sí antes del bloqueo: frena — … Decile a la persona qué se frenó y pedile que lo confirme
            2. segundo sí, ya con el push retenido: pasa
modo auto:  1 y 2 frenan y abren el diálogo de Claude Code: preguntar antes suma la pregunta del chat al diálogo
```

En `claude -p` no se puede medir: ahí el diálogo nativo no se contesta y cuenta como rechazo (`engine/hooks/confirm.js`).

## Causa raíz

R10 no dice cuándo se pregunta.

## Fix propuesto

Un párrafo al final de R10 (`template/planning/rules/system/commits.md`): si un guard cuida el paso, se anuncia, se corre, y si frena se pregunta nombrando lo frenado. Lo que ningún guard cuida se pregunta antes, porque ahí intentarlo ya es hacerlo.

## Tradeoffs

- Baja a las instancias y suma peso (ver 562).
- La contracara es la que más importa y va en la misma frase: lo que no tiene guard no se intenta para ver qué pasa.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia.

## Relacionados

- 184 — confirmar dejó de exigir una palabra.
- 556 — un guard del proyecto retiene para el sí.

## Cierre

- **El párrafo en R10**: se hizo (`template/planning/rules/system/commits.md`). La revisión mostró que, dicho en
  general, un agente en una instancia sin el guard instalado podía leerlo como permiso para empujar. Acotarlo a «donde
  el guard está instalado» tampoco alcanzaba: un guard frena formas de comando, y un `npm publish` o un script de
  deploy no declarado pasan con los guards instalados (la última revisión). Quedó en «donde se sabe que un guard frena
  esa forma del comando en este repositorio», y donde no se sabe se pregunta antes.
- **La medición**: se hizo con el arnés del canal de chat, que corre el hook y el registro reales. En `claude -p` no se
  puede, porque el diálogo nativo no se contesta y cuenta como rechazo (`engine/hooks/confirm.js`).

Lo que se corrió: el arnés con un «sí», un `git push origin feat/x`, otro «sí» y el mismo push. Modo `plan`: el primer
push frena, el segundo pasa. Modo `auto`: los dos abren el diálogo, así que preguntar antes suma la pregunta del chat
al diálogo. Y `test/wiring/rules.test.js` con el peso nuevo.

**Sin probar:** una sesión interactiva real con alguien que conteste el diálogo.

### Lista de cierre

1. hecho: el arnés mostró el sí que no aprueba nada, antes de escribir la regla.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: la prueba del peso, roja con el texto nuevo y verde al declararlo.
4. no aplica: es texto de regla; no hay código que mutar.
5. no aplica: agrega un párrafo, no quita nada.
6. hecho: el hook y el registro de chat reales, sin dobles, en dos modos.
7. no aplica: el runner no se puede ejercer con `-p` (el diálogo cuenta como rechazo); la sesión interactiva queda en Sin probar.
8. hecho: el arnés corrió con el motor de esta rama.
9. hecho: dos modos de permiso, `plan` y `auto`.
10. hecho: dependía la prueba del peso de las reglas, actualizada junto con el 562.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
