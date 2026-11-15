---
caso: 516
titulo: En Gemini la copia de una mutación no tiene dónde escribirse, y el bloqueo le recomienda un lugar que Gemini no deja usar
estado: resuelto
resuelto-en: 0.121.0
prioridad: media
version-detectada: 0.121.0
---

# 516 — En Gemini la copia de una mutación no tiene dónde escribirse, y el bloqueo le recomienda un lugar que Gemini no deja usar

**🟢 resuelto en 0.121.0** · detectado en 0.121.0 (rama `fix/e2e-120-findings`, sin publicar) · prioridad **media**: es el mismo hueco
que el caso 510 cerró para Claude y Antigravity, en el único runner donde no alcanza.

## Resumen

R23 pide correr una mutación en una copia, y el 510 dejó el temporal del sistema escribible para `workspace-boundary`.
En Gemini CLI eso no sirve: Gemini mismo rechaza `/tmp` como «fuera del workspace», y el único lugar desechable que
permite —su «project temp directory», `~/.gemini/tmp/<proyecto>`— lo frena `workspace-boundary` por estar fuera de las
raíces. El mensaje del bloqueo, además, le recomienda `/tmp`, que Gemini no le deja usar.

## Reproducción

En una instancia con Gemini instalado y la carpeta de confianza:

```bash
GEMINI_CLI_TRUST_WORKSPACE=true gemini --yolo -o json -p 'Con write_file creá /tmp/copia/mut.js con «x».'
GEMINI_CLI_TRUST_WORKSPACE=true gemini --yolo -o json -p 'Con write_file creá mut.js en tu project temp directory.'
```

## Síntoma

Gemini CLI 0.63.0, proyecto de prueba `gemini` de la prueba de punta a punta, motor de la rama:

```
/tmp/r121-gem-copia/mut.js        Path not in workspace: … resolves outside the allowed workspace directories:
                                  /var/tmp/e2e-120/gemini or the project temp directory: $HOME/.gemini/tmp/gemini-1
$HOME/.gemini/tmp/gemini-1/mut.js Tool execution blocked: BLOQUEADO: … está, fuera de las raíces declaradas en
                                  ops.config.json … Una copia desechable —una mutación, una sonda— va en el temporal
                                  del sistema, /tmp, que este límite no frena.
```

El primer rechazo es de Gemini; el segundo, de Cauce. Antigravity 1.5.9, en cambio, escribió la copia en `/tmp`.

La entrada que Gemini le manda al hook (capturada con un hook temporal en el banco) trae `transcript_path`:

```
{ "session_id": "…", "transcript_path": "$HOME/.gemini/tmp/gemini-1/chats/session-2026-11-15T13-32-….jsonl",
  "cwd": "/var/tmp/e2e-120/gemini", "hook_event_name": "BeforeTool", "tool_name": "write_file", … }
```

## Causa raíz

- `engine/hooks/input.js`, `writableRoots` y `sessionScratch`: el scratchpad de la sesión cuenta sólo si llega como
  `scratchpad_dir` (Claude Code) y cuelga del temporal del sistema. Gemini no lo manda así, y su temporal vive bajo el
  home.
- `engine/hooks/boundary.js`, `inTemp`: el temporal del sistema, que Gemini no permite.
- `engine/hooks/files.js`, el mensaje del bloqueo: recomienda `/tmp` sin saber el runner.

## Fix propuesto

**Decisión que pide a la persona:** si el temporal de proyecto de Gemini cuenta como desechable, aunque cuelgue del home.

- **A — contarlo (recomendada).** Con `transcript_path` bajo `~/.gemini/tmp/<x>/chats/`, la carpeta `~/.gemini/tmp/<x>`
  es escribible para los dos guards de límites, como el scratchpad de Claude (caso 288). Sólo esa carpeta, deducida de
  la entrada y comprobada contra la forma exacta, no el home ni `~/.gemini`. El mensaje del bloqueo nombra el lugar
  desechable del runner que corre: `/tmp`, o esa carpeta en Gemini.
- **B — no contarlo.** El mensaje deja de recomendar `/tmp` en Gemini y dice que ahí la copia no tiene lugar: la mutación
  se corre en memoria o la declara la persona en `writableOutsideRoots`.

## Tradeoffs

- A abre una carpeta bajo el home, que R23 no cuenta como desechable. Es la que Gemini le da a la sesión para eso, y
  sólo la de esa sesión; un `transcript_path` armado a mano podría apuntar a otra, así que la forma se comprueba entera.
- Hay que medirlo con una mutación real de `/autobuild` en Gemini, no sólo con el guard.

## Contexto de descubrimiento

Pruebas de lo que quedaba sin probar de la rama `fix/e2e-120-findings` (2026-11-15): «Gemini copiando a `/tmp`».

## Relacionados

- 510 (el temporal para la herramienta de archivos), 288 (el scratchpad de la sesión), 512 (otro límite de workspace de
  Gemini, sobre `node_modules`).

## Cierre

Se tomó la opción A. `runnerScratch`, en `engine/hooks/input.js`, deduce el temporal de proyecto de Gemini del
`transcript_path` de la entrada —`~/.gemini/tmp/<proyecto>/chats/…`— y lo suma a `writableRoots`, que es de donde
preguntan los dos guards de límites. Sólo esa carpeta, y sólo si no es un enlace. El bloqueo de `workspace-boundary`
nombra el lugar desechable del runner que corre: esa carpeta en Gemini, el temporal del sistema en los demás.

Línea de base: las dos sondas del caso con Gemini CLI 0.63.0.

Contra el caso:

- **Fix A, contar el temporal de proyecto:** se hizo.
- **El mensaje nombra el lugar del runner:** se hizo.
- **Fix B:** se decidió que no, por la opción tomada.
- **Tradeoff, una carpeta bajo el home:** se paga, acotado: sólo `~/.gemini/tmp/<una carpeta>`, con `chats/` debajo en la
  ruta que llega, y no si esa carpeta es un enlace. Con eso se abre también el historial de la propia sesión
  (`chats/`), que la sesión puede reescribir o borrar; es de la sesión y lo escribe Gemini, y exceptuarlo se decidió que
  no, porque no protege nada que la sesión no pudiera tocar ya por la herramienta de Gemini.
- **Tradeoff, medirlo con una mutación real de `/autobuild` en Gemini:** se hizo. `/cauce:autobuild` corrió en el banco
  de Gemini sobre `agregar-resta`, con la mutación declarada en la aceptación. La sesión armó la copia en `/tmp` desde su
  terminal —el límite de Gemini es de su herramienta de archivos, no del shell— y la mutación dio rojo ahí
  (`AssertionError: -2 == 2`); `src/resta.js` quedó como lo commiteó (`a3ce8a3`). En esa corrida no usó su temporal de
  proyecto: el arreglo deja disponible ese lugar para la herramienta de archivos, y la corrida no lo necesitó. Su primer
  intento lo frenó la política propia de Gemini (`Tool execution denied by policy`), no un guard.

Lo que el caso no preveía, de la revisión independiente: una carpeta de la sesión que es un enlace abría lo que tiene
detrás, porque el límite juzga por dónde cae la escritura. Pasaba también con el scratchpad de Claude Code (caso 288); se
cerró en los dos.

### Lista de cierre

1. hecho: las dos sondas del caso, `/tmp` rechazado por Gemini y su temporal de proyecto frenado por Cauce.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «el temporal de proyecto de Gemini se puede escribir, y sólo el de la sesión», en
   `test/hooks/boundaries.test.js`, en rojo con el motor anterior y en verde con el nuevo.
4. hecho: mutaciones en rojo en una copia: sin `runnerScratch` en las raíces, sin la condición de `chats/`, sin la de
   `..`, con el mensaje de antes, y sin el chequeo de enlace en las dos carpetas de sesión. El largo exacto de la ruta
   sobrevivió porque no cambiaba lo que se abre, y se quitó.
5. hecho: lo que se quita es el freno del temporal de Gemini. La prueba afirma que el home, `~/.gemini`, otro proyecto y
   una carpeta enlazada siguen frenando, y la sonda de antes y la de después están en «Qué se corrió».
6. hecho: Gemini CLI 0.63.0 real, con el motor de la rama: la escritura en el temporal de proyecto con la primera versión
   y con la final, y un `/cauce:autobuild` entero con su mutación en una copia.
7. hecho: lo que depende del runner corrió en Gemini.
8. hecho: corrieron la herramienta de archivos de Gemini y, en pruebas, la de shell; el `transcript_path` de Claude Code
   no abre nada. No corrió Codex.
9. hecho: dos runners que mandan `transcript_path` (Gemini y Claude Code) y dos carpetas de sesión (la de Gemini y el
   scratchpad).
10. hecho: `writableRoots` lo leen sólo `workspace-boundary` y `shell-boundary`; el encabezado de `boundary.js` ahora
    nombra las carpetas de sesión.
11. hecho: una pasada independiente: nada que impidiera entregar; el enlace se arregló, y el comentario y el encabezado
    se corrigieron.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1811 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

Gemini CLI 0.63.0, `write_file` de `mut.js` en su temporal de proyecto:

```
antes   BLOQUEADO: $HOME/.gemini/tmp/gemini-1/mut.js está, fuera de las raíces declaradas en ops.config.json …
        Una copia desechable … va en el temporal del sistema, /tmp …
después Successfully created and wrote to new file: $HOME/.gemini/tmp/gemini-1/mut.js.
```

El archivo de la sonda se borró después de leer su ruta y su contenido.

Después de publicar 0.121.0 (2026-11-15), un `/cauce:autobuild` de Gemini CLI 0.63.0 sobre un banco instalado con el
paquete publicado, con la aceptación pidiendo la copia con `write_file` en el temporal de proyecto:

```
write_file          $HOME/.gemini/tmp/gemini-2/resta-mutation.js  «module.exports = (a, b) => b - a»
run_shell_command   node -e "… require('…/resta-mutation.js'); assert.equal(resta(5, 3), 2)"  → AssertionError: -2 == 2
```

Ningún guard frenó la copia; los dos bloqueos de la sesión fueron un `git commit` y un `git push` sobre `master`, y
`src/resta.js` quedó con `a - b` (`f533801`). La copia la pidió la aceptación: sin eso, la corrida anterior la hizo por
la terminal en `/tmp`.

**Sin probar:** Codex.

