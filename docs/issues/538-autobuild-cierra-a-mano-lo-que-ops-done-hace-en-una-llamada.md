---
caso: 538
titulo: el Done de /autobuild cierra a mano, con un agente y prosa, lo que `ops done` hace en una llamada
estado: abierto
prioridad: baja
version-detectada: 0.124.0
---

# 538 — el Done de /autobuild cierra a mano, con un agente y prosa, lo que `ops done` hace en una llamada

**🔴 abierto** · detectado en 0.124.0 · prioridad **baja**: el cierre de `/autobuild` funciona hoy (lo midió la corrida
real del caso 463). Lo que se gana es costo por tarea y no tener dos implementaciones del mismo cierre que pueden
divergir. Cambiar quién cierra es una quita (R29) y pide una corrida real antes y después, unos USD 7 cada una.

## Resumen

Desde el caso 537, `ops done <planning> <tarea> --fields <archivo>` hace el paso 13 del PROTOCOL en una llamada:
- valida la entrada entera antes de escribir;
- escribe la viñeta con el slug de la cola;
- saca la tarea y sus notas sin tocar lo comentado;
- borra el hito vacío salvo que guarde borradores;
- cierra la épica, deja el WIP en `status: IDLE` y suelta el reclamo;
- comprueba con `check --closed`.

El Done de `/autobuild` no lo usa. Le pide todo eso a un agente en un prompt de 58 líneas
(`automatization/workflows/autobuild.js:2489-2546`), que mezcla dos cosas:
- **Juicio:** qué va en `done`, `qa`, `tests` y `decisions`, cómo se reescriben las rutas, qué se copia textual.
- **Mecánica:** qué línea sacar de qué archivo, cuándo borrar el hito, cuándo cerrar la épica, la forma de
  `status: IDLE`, `release`, y corregir y volver a correr `check`.

La mecánica que hace el agente es la misma que hace `ops done`, implementada otra vez en prosa. Los bordes que el 537
encontró corriendo no están en ese prompt:
- la tarea dentro de un comentario o fuera de un `## Hito`;
- el comentario que la línea de la tarea abre;
- el hito con borradores comentados;
- el frontmatter con espacios en la cerca.

## Reproducción

Sin modelo, leyendo el prompt que arma el recorrido:

```bash
sed -n 2489,2546p automatization/workflows/autobuild.js | grep -c ''          # 58 líneas de prompt de Done
grep -n 'ops done\|ops.js done' automatization/workflows/autobuild.js; echo "exit=$?"   # exit=1: no lo nombra
```

Con modelo, la corrida real de `/autobuild` del 2026-11-21 (caso 463, banco `sidecar`, tarea `lite`): el agente de
Done usó **8 herramientas y 326.232 tokens de entrada** para cerrar una tarea. Para comparar, dos sesiones reales de
`claude -p` que cerraron la misma clase de tarea con `ops done` (caso 537, 2026-11-22) costaron USD 0,52 y USD 0,65
**enteras**, con la verificación del producto incluida.

## Síntoma

Dos cierres del mismo paso 13 que no comparten código. Un arreglo al cierre se hace dos veces, o se hace en uno solo y
el otro queda atrás sin que nada falle. Ya divergieron una vez. `ops done` exigía `decisions` y el prompt de
`/autobuild` no la nombra entre los campos que pide: la escribe sólo con notas de build. El PROTOCOL le daba la razón
al prompt. Lo encontró la primera sesión real del 537, que rellenó `decisions` con evidencia para pasar, y se arregló
ahí. Nada comparaba las dos.

## Causa raíz

El orden en que se construyeron. El Done de `/autobuild` es anterior a `ops done` (caso 537), y el 537 dejó fuera de
su alcance que el recorrido lo adoptara (su «Tradeoffs»).

## Fix propuesto

El agente de Done escribe el archivo de campos (lo que juzga) y corre `ops done`; la mecánica sale del prompt.

- El prompt conserva lo que es juicio: la redacción de `done` y `qa`, `lane`, `review` y `critique` textuales,
  `settled()` para las rutas, las trazas de `tests`, las notas de build en `decisions`.
- Pierde la parte mecánica: qué sacar de la cola, el hito, la épica, el IDLE, `release`, y el `check --closed` con su
  instrucción de corregir, porque `ops done` ya corre `check --closed` y si algo está mal no escribe nada.
- Si `ops done` sale con 1, el agente corrige el campo que nombra y vuelve a correrlo. Ya no hay un estado escrito a
  medias que reparar.
- `--line` viaja como hoy viaja `ON_LINE` en `release`.
- El archivo de campos va fuera del árbol de la instancia, en el temporal; `ops done` lo lee por ruta.

## Tradeoffs

- **Es una quita** (R29): cambia quién hace el cierre. Se sostiene con la salida de antes y la de después sobre el
  mismo caso, lado a lado:
  - la misma tarea en el mismo banco `sidecar`, por `claude -p '/autobuild'`;
  - el diff de `planning/` tras cada corrida;
  - herramientas y tokens del agente de Done en cada una.
  
  Unos USD 7 por corrida (memoria del proyecto: autobuild real). La comparación va en la aceptación, no en el plan.
- **El `closing` del recorrido** repara hoy lo que Done deja mal (`closing-repair`). Con `ops done` validando antes de
  escribir, la reparación debería quedar sin trabajo en el camino feliz. Hay que medir que siga sirviendo para lo
  que no es Done: otra tarea, otra sesión.
- **El arnés de `test/workflows/`** asercia frases del prompt de Done (`autobuild-closing.test.js`,
  `autobuild-claim.test.js`). Esas aserciones cambian, y ahí está el riesgo de que verde no diga nada: el arnés mira el
  prompt, no el disco (memoria: «el arnés mira el prompt, no el disco»). Lo que llega a `done/` se prueba con la
  corrida real.
- **Una entrada que `ops done` rechaza y `check` aceptaba**: no debería haber ninguna, porque `ops done` usa la misma
  `doneEntryErrors`. Se comprueba con la corrida, no se supone.

## Contexto de descubrimiento

Paso 3 de la auditoría de una instancia (2026-11-21). El caso 537 construyó `ops done` y dejó su adopción por el
recorrido para decidir aparte. La prueba real del 537 (dos sesiones de `claude -p` que eligieron `ops done` leyendo
sólo el PROTOCOL) muestra que un agente lo usa sin que se lo nombren. La primera de esas sesiones encontró además que
`decisions` se exigía contra el PROTOCOL, y se arregló dentro del 537.

## Relacionados

- 537: `ops done`, el comando que esto adoptaría.
- 463: `--closed`, la comprobación de que la tarea salió de la cola por su slug, que hoy el prompt de Done pide correr.
- 211, 301, 310: por qué `lane`, `review` y `critique` van textuales, y por qué `done` y `qa` no. Eso es juicio y se
  queda en el prompt.
- 266: el commit de planning después del cierre (`commitPerTask`), que no cambia.
