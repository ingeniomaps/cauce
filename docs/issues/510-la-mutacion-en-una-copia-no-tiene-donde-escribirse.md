---
caso: 510
titulo: La mutación en una copia que pide R23 no tiene dónde escribirse, y los agentes terminan mutando el árbol de trabajo
estado: abierto
prioridad: alta
version-detectada: 0.120.0
---

# 510 — La mutación en una copia que pide R23 no tiene dónde escribirse, y los agentes terminan mutando el árbol de trabajo

**🔴 abierto** · detectado en 0.120.0 · prioridad **alta**: es el camino principal de `/autobuild` —toda aceptación con
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
