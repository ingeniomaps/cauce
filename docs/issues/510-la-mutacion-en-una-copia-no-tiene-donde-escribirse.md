---
caso: 510
titulo: La mutación en una copia que pide R23 no tiene dónde escribirse, y los agentes terminan mutando el árbol de trabajo
estado: resuelto
resuelto-en: 0.121.0
prioridad: alta
version-detectada: 0.120.0
---

# 510 — La mutación en una copia que pide R23 no tiene dónde escribirse, y los agentes terminan mutando el árbol de trabajo

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **alta**: es el camino principal de `/autobuild` —toda aceptación con
mutación declarada pasa por acá— y la salida que encuentran los agentes es la que la regla prohíbe.

## Resumen

R23 dice que una mutación «se corre en una copia siempre», y R29 que se declara en la aceptación. En una corrida real de
`/autobuild`, cuatro agentes intentaron escribir la copia con la herramienta de archivos en `/tmp/…` y
`workspace-boundary` frenó las 8 escrituras: el temporal del sistema está fuera de las raíces. El guard de shell, en
cambio, exime el temporal (caso 360). Los agentes cayeron en dos salidas peores: mutaciones «en memoria» con `node -e`,
que no son la prueba real, y Build mutando `src/cart.js` en el árbol de trabajo. La entrada de DONE quedó con las dos
versiones contradiciéndose (caso 511).

## Reproducción

En cualquier instancia instalada, sin modelo:

```bash
P=<proyecto>
printf '%s' "{\"session_id\":\"p\",\"cwd\":\"$P\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/mut/cart.js\",\"content\":\"x\"}}" \
  | CLAUDE_PROJECT_DIR=$P $P/ops/automatization/hooks/guard-files.sh; echo "exit=$?"
```

Con modelo: `claude -p '/autobuild --max 1'` sobre una tarea cuya aceptación declara una mutación (sesión ed6e47f4,
USD 11,43).

## Síntoma

La sonda: `BLOQUEADO: /tmp/mut/cart.js está, fuera de las raíces declaradas en ops.config.json. Si el proyecto necesita
escribir ahí siempre, lo declara una persona en writableOutsideRoots …` y exit 2. Lo mismo con `/var/tmp/mut/cart.js`.

En la corrida, del transcript de la sesión y sus subagentes, las escrituras frenadas (cada una intentada dos veces):

```
/tmp/qa-mut-cupon/src/cart.js      /tmp/qa-mut-cupon/test/cart.test.js   /tmp/qa-mut-tienda/src/cart.js
/tmp/rev-cupon/src/cart.js         /tmp/rev-cupon/test/cart.test.js      /tmp/rev-cupon-probe.js
/tmp/rv/s.js                       /tmp/sweep-tienda/sweep.js
```

Y lo que quedó en `done/`: `decisions: … La mutación se corrió sobre ./src/cart.js en el árbol de trabajo y se deshizo
enseguida, sin commitear. La razón: el sandbox exigía aprobación para escribir en /tmp.` mientras `qa:` dice «corrida en
memoria … sin escribir en disco» y explica «guard-files frena escribir fuera de las raíces».

## Causa raíz

- `engine/hooks/input.js:359-368` (`writableRoots`): las raíces declaradas, `writableOutsideRoots` y el scratchpad de la
  sesión (`sessionScratch`, `input.js:370-382`, caso 288). El temporal del sistema no está.
- `engine/hooks/boundary.js:8`: el guard de shell sí exime el temporal, por dónde cae la escritura.
- El scratchpad sólo vale si el runner lo manda en `scratchpad_dir`. En esta corrida (`claude -p`) los agentes no lo
  usaron y el mensaje del bloqueo no lo nombra; si `claude -p` lo manda, no se comprobó.
- `template/planning/rules/system/conduct.md`, R23: «una mutación que apaga una defensa se corre en una copia siempre».

## Fix propuesto

Que exista un lugar desechable donde la copia se pueda escribir con la herramienta de archivos, y que el bloqueo lo
nombre. En orden de preferencia:

1. **Eximir el temporal del sistema en `workspace-boundary`, como ya lo hace el guard de shell** (`boundary.js:8`).
   Alinea los dos caminos y es lo que R23 llama desechable. El riesgo que se abre —escribir algo en `/tmp`— es el mismo
   que ya existe por shell.
2. Si se prefiere no abrir todo el temporal: un prefijo propio (`<tmpdir>/cauce-copy-*`) eximido, y el mensaje del
   bloqueo y el prompt de QA y Review que lo nombren como el lugar de la copia.

En los dos casos, el mensaje del bloqueo de `workspace-boundary` sobre una ruta del temporal dice dónde sí se puede
escribir la copia, en vez de mandar a declarar `writableOutsideRoots`.

## Tradeoffs

- Eximir el temporal deja que un agente escriba ahí lo que sea. Los guards de contenido —secretos, migraciones, pruebas—
  siguen corriendo; lo que se afloja es sólo el límite de raíces, y ya estaba aflojado por shell.
- Hay que medir que el arreglo cambie la conducta y no sólo la salida del guard: una corrida real de `/autobuild` con
  mutación declarada donde la copia quede en el temporal y `src/` no se toque. Sin esa corrida el caso no se cierra.

## Contexto de descubrimiento

Prueba de punta a punta de 0.120.0 (2026-11-14), primer `/autobuild` real sobre una tarea de cupones en un proyecto
Node de prueba.

## Relacionados

- 288 (scratchpad de la sesión eximido), 360 (el guard de shell exime el temporal).
- 511: la contradicción en DONE que dejó esta corrida.

## Cierre

Se tomó la opción 1. `workspace-boundary` exime el temporal del sistema por dónde cae la escritura, con la misma
comprobación que `shell-boundary`: `inTemp`, en `engine/hooks/boundary.js`, que ahora usan los dos. Un enlace del temporal
que lleva afuera sigue frenando por los dos. El bloqueo fuera de las raíces termina nombrando el temporal como el lugar
de una copia desechable.

Línea de base: la sonda del caso, `Write` a `/tmp/mut/cart.js` y a `/var/tmp/mut/cart.js`, exit 2; y la corrida de
`/autobuild` del 2026-11-14 con 8 escrituras frenadas.

Contra el caso:

- **Fix 1, eximir el temporal como el guard de shell:** se hizo.
- **Fix 2, un prefijo propio:** se decidió que no, por la opción tomada.
- **El mensaje nombra dónde escribir la copia:** se hizo.
- **Tradeoff, cualquier cosa en `/tmp`:** se paga. Los guards de contenido siguen corriendo ahí.
- **Tradeoff, medir la conducta y no sólo el guard:** hecho (ver «Qué se corrió»).

Lo que el caso no preveía:
- revierte un borde del caso 288, que dejaba el temporal cerrado para la herramienta de archivos. Ese borde existía para
  que el dato `scratchpad_dir` no abriera rutas arbitrarias, y eso sigue igual: el home y `/` no se abren;
- once pruebas montaban el proyecto dentro del temporal y medían el límite sobre él, así que con el temporal abierto
  medían la exención. Se movieron al banco de fuera (`outsideTempRoot`), como ya hacían las del shell.

Queda anotado, de la primera revisión: una cadena de más de 40 enlaces dentro del temporal que termine afuera cuenta
como temporal, porque `landing` corta ahí. Ya pasaba igual en el guard de shell, y sólo lo arma alguien a propósito.

### Lista de cierre

1. hecho: la sonda del caso, exit 2 a `/tmp` y a `/var/tmp`, y los 8 frenos de la corrida del 2026-11-14.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «la herramienta de archivos escribe en el temporal igual que el shell», en `test/hooks/boundary-links.test.js`,
   en rojo sin la exención y en verde con ella.
4. hecho: mutaciones en rojo en una copia: sin la exención, `inTemp` juzgando la ruta escrita en vez de dónde cae, y el
   mensaje sin la línea del temporal.
5. hecho: lo que se quita es el freno del temporal en la herramienta de archivos. La prueba del 288 se reescribió para
   afirmar que el home y `/` siguen frenando, y la salida de antes y la de después están en «Qué se corrió».
6. hecho: `/autobuild --max 1` real, en el proyecto de punta a punta con el motor de la rama.
7. hecho: lo que depende del modelo corrió en Claude Code, con `claude -p` (USD 9,80).
8. hecho: corrieron `Write` al temporal, a un enlace del temporal que sale, fuera de las raíces, y por shell lo mismo. No
   corrieron Codex, Gemini ni Antigravity.
9. hecho: los dos guards de límites sobre las mismas rutas.
10. hecho: el encabezado de `boundary.js`, la constante del temporal que vivía en `shell.js` (ahora es `inTemp`, una
    sola), las pruebas del 288 y del 360, y las que montaban el proyecto en el temporal.
11. hecho: tres pasadas independientes; ninguna halló nada que impidiera entregar en este caso.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1806 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

La sonda, con el motor de la rama: `Write` a `/tmp/…/src/cart.js` pasa, uno a `/var/tmp/otro/a.js` frena con «… está
fuera de las raíces … Una copia desechable —una mutación, una sonda— va en el temporal del sistema, /tmp, que este límite
no frena.»

`/autobuild --max 1` sobre `rechazar-cupon-invalido` (sesión 129bad91):

```
antes   8 Write a /tmp frenados por guard-files.sh; Build mutó src/cart.js en el árbol de trabajo
después /tmp/qa-tienda/mut1/src/cart.js, mut2, /tmp/mutate-cupon.js: «File created successfully»
        las 7 mutaciones en copias; las ediciones de src/cart.js son sólo la implementación
```

Lo que todavía frenó a un agente en esa corrida fue el permiso propio de Claude Code para un comando fuera de la carpeta
de la sesión (`mkdir … needs approval`), que no es de Cauce.

**Sin probar:** Codex, Gemini y Antigravity escribiendo la copia con su herramienta de archivos.
