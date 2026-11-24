---
caso: 538
titulo: el Done de /autobuild cierra a mano, con un agente y prosa, lo que `ops done` hace en una llamada
estado: resuelto
resuelto-en: 0.124.0
prioridad: baja
version-detectada: 0.124.0
---

# 538 — el Done de /autobuild cierra a mano, con un agente y prosa, lo que `ops done` hace en una llamada

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **baja**: el cierre de `/autobuild` funciona hoy (lo midió la corrida
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

- El prompt conserva lo que es juicio: la redacción de `done` y `qa`, `review` y `critique` textuales,
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

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, el agente escribe lo que juzga y corre `ops done`**: se hizo. El prompt conserva la redacción de
  `done` y `qa`, `review` y `critique` textuales, `settled()` para las rutas, las trazas de `tests` y las notas de build
  en `decisions`. Perdió lo mecánico: la cola, el hito, la épica, el IDLE, `release` y `check --closed`.
  - Se hizo distinto en un punto: el carril tampoco lo copia el agente, porque `ops done` lo saca del disco.
- **Si `ops done` sale con 1**: se hizo distinto de como decía el caso, que suponía que un 1 nunca deja nada escrito.
  - La revisión encontró que `check` corre después de escribir y podía rechazar lo que la validación previa dejaba
    pasar: un `tests: n/a` sobre un commit que toca código. El agente quedaba sin salida, porque el segundo intento
    encuentra la entrada ya escrita.
  - Se arregló adentro de `ops done`, que ahora corre esa regla antes de escribir.
  - El prompt distingue «No se escribió nada» de un `check` en rojo después de escribir, y de los otros rechazos.
- **`--line`**: viaja como antes, en el comando de `ops done`.
- **El archivo de campos en el temporal**: se hizo, con el nombre de la sesión, `done-<WIP>-<tarea>.md`. La primera
  versión usaba un nombre fijo, y una corrida real encontró el que había dejado otra instancia.
- **Tradeoffs, es una quita y se sostiene lado a lado**: hecho, con corridas reales sobre la misma tarea y el mismo
  banco, abajo.
- **Tradeoffs, el `closing`**: sigue sirviendo. En las corridas de después corrió igual (5 herramientas, unos 25.000
  tokens) y `closing-repair` no se llamó.
- **Tradeoffs, el arnés mira el prompt**: las aserciones del prompt viejo se cambiaron por las del nuevo, con
  aserciones de ausencia de la mecánica que se fue. Lo que llega a `done/` se probó en disco (`done-command.test.js`) y
  con las corridas reales.
- **Tradeoffs, una entrada que `ops done` rechace y `check` acepte**: no apareció ninguna. Apareció la inversa, la de
  arriba, y se arregló.
- **Lo que el enunciado no preveía**: la revisión y las corridas encontraron tres cosas más, todas arregladas con su
  prueba:
  - **El carril.** `ops done` tomaba el de la cola antes que el del WIP. Así perdía la subida de `express` a `directo`
    que hace la corrida cuando la tarea toca una superficie crítica. Ahora va primero el WIP propio, después el de otra
    sesión y después la cola, y un `sin clasificar` no le gana a la cola.
  - **La carpeta desde donde se corre.** El WIP que `ops done` deja en IDLE es el de quien lo corre, y quién es sale de
    la carpeta. En una corrida real el agente lo corrió desde otra, cerró la tarea y dejó el WIP de la sesión apuntándola.
    Ahora el comando lleva el `cd`, y si la salida dice que el WIP «es de otra sesión», el prompt y el aviso mandan a
    repetirlo desde la carpeta correcta. Repetirlo no reescribe la entrada.
  - **El temporal.** Un nombre fijo chocaba entre instancias. Ahora lleva el de la sesión.
  - `template/planning/delivery/teamwork.md` nombraba `ops release` para el cierre de quien revisa; ahora `ops done`.
  - El escriba (`cauce-scribe.md`) no podía escribir fuera de planning: ahora puede escribir el temporal que el pedido
    nombra.

Lo que se corrió (Claude Code 2.1.330 por `claude -p`, banco `sidecar` fuera del árbol con el motor congelado, tarea
`lite` `sumar-dos-numeros`; los diffs de `planning/` y las métricas en el scratchpad de la sesión):

| corrida | motor | agente de Done | resultado |
|---|---|---|---|
| antes | `69d16fa6` | 10 herramientas, 1.253.124 tokens de entrada | cerró; lee la cola y los README, edita la cola y el WIP a mano, corre `release` y `check`. USD 9,37 |
| después 1 | árbol con el cambio | 3 herramientas, 427.401 | cerró, pero dejó el WIP de la sesión apuntando a la tarea: corrió `ops done` desde otra carpeta. USD 9,86 |
| después 2 | con el `cd` y el aviso | 6 herramientas, 871.418 | cerró limpio; tres herramientas de más por el archivo de campos que había dejado la corrida anterior. USD 8,85 |
| después 3 | versión final | 3 herramientas, 420.109 | cerró limpio: WIP en IDLE, reclamo suelto, `check` en verde, el archivo de campos con el nombre de la sesión. USD 8,44 |

La entrada de `done/` sale con los mismos campos y el mismo carril antes y después; el diff de `planning/` es la tarea
fuera de la cola y la entrada nueva, más las propuestas de INBOX que cada corrida deja por su cuenta.

- Pruebas: las del arnés de `test/workflows/` pasadas al prompt nuevo, en rojo con el prompt viejo (8 de ellas), y
  cuatro de disco nuevas en `test/planning/done-command.test.js`: el carril subido, el WIP propio contra el ajeno, el
  `sin clasificar` y el `tests: n/a` que frena antes de escribir.
- 11 mutaciones en una copia, las 11 rojas.

**Sin probar:** el rol de revisión (`/autobuild --role review`) cerrando por `ops done` en una corrida real; una línea
de trabajo en una corrida real (el `--line` lo cubre el arnés); y un `wipFile` fuera de la forma `wip/<nombre>.md`, que
el motor no produce y daría un nombre de archivo raro.

### Lista de cierre

1. hecho: la corrida real de antes, sobre el mismo banco y la misma tarea que las de después.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo con el prompt y el `ops done` viejos, y en verde después.
4. hecho: 11 mutaciones en una copia, las 11 rojas.
5. hecho: cambia quién cierra; se sostiene con las corridas de antes y después lado a lado, y con las aserciones de ausencia de la mecánica vieja.
6. hecho: tres corridas reales después del cambio; se midió que la mecánica vieja se fue (el agente ya no edita la cola ni el WIP) y que el cierre queda bien.
7. hecho: lo que depende del modelo corrió en `/autobuild` real, autorizado por la persona.
8. hecho: la última corrida real es sobre la versión final del código del 538.
9. hecho: dos WIP en el banco de pruebas, el propio y el de otra sesión; y una corrida que encontró el archivo de otra instancia.
10. hecho: dependían el arnés de `test/workflows/`, `teamwork.md`, el escriba, el conteo de `runners-contract` y `closing`; todos se tocaron o se comprobaron.
11. hecho: cuatro pasadas de revisión independiente; la primera halló dos bloqueantes y la segunda uno, que se arreglaron y se revisaron en la siguiente. Las corridas reales hallaron dos más, arreglados y vueltos a correr.
12. hecho: pasada de comentarios sobre el diff, en las revisiones.
13. hecho: `npm run ci` con los archivos nuevos stageados, en verde.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
