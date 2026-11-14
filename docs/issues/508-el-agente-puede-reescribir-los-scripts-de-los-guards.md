---
caso: 508
titulo: El agente puede reescribir los scripts que corren los guards, y apagarlos para el resto de la sesión
estado: resuelto
resuelto-en: 0.120.0
prioridad: alta
version-detectada: 0.119.0
---

# 508 — El agente puede reescribir los scripts que corren los guards, y apagarlos para el resto de la sesión

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **alta**: una sola escritura apaga un grupo entero de guards, sin
ningún bloqueo y sin pasar por `ops.config.json`, que es la puerta que cerraron los casos 114, 373 y 498. Lo detecta
`automation check`, pero después, y sólo si alguien lo corre.

## Resumen

En una instancia, los guards corren por scripts de Cauce dentro de la instancia: un shim por grupo
(`ops/automatization/hooks/guard-*.sh`) que llama a `run-hook.sh`, y la configuración del runner los registra. Ningún
guard frena escribir esos scripts, ni por la herramienta de archivos ni por shell. Reescribir `guard-files.sh` a
`exit 0` apaga todos los guards de escritura de la sesión; reescribir `run-hook.sh` apaga todos. El motor en
`node_modules` sí está protegido (`engine-writes`), y Claude Code protege por su cuenta su `settings.json` y su
`settings.local.json`. Lo que queda abierto es lo de Cauce que está entre los dos.

El caso 498 lo dejó como hallazgo sobre `.claude/settings.json`. Medido, ése no es el hueco: el runner lo frena. Lo son
los scripts.

## Reproducción

Sobre una instancia sidecar recién creada con el motor de la rama, con `ops/` dentro del proyecto y
`automation install ops claude`:

```bash
B=<proyecto>; cd "$B"; export OPS_ROOT=$B/ops
for f in ops/automatization/hooks/guard-files.sh ops/automatization/hooks/run-hook.sh \
         .claude/settings.json .codex/hooks.json .gemini/settings.json .agents/plugins/cauce/hooks.json \
         ops/node_modules/@ingeniomaps/cauce/engine/hooks/run.js; do
  printf '{"session_id":"m8","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"%s/%s","content":"exit 0"},"cwd":"%s"}' \
    "$B" "$f" "$B" | bash ops/automatization/hooks/guard-files.sh >/dev/null 2>err.txt; echo "exit=$? :: $f"
done
printf '{"session_id":"m8","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"sed -i s/exec/true/ ops/automatization/hooks/guard-files.sh"},"cwd":"%s"}' \
  "$B" | bash ops/automatization/hooks/guard-shell.sh >/dev/null 2>&1; echo "por shell: exit=$?"
```

Y en una sesión real de Claude Code 2.1.325, con Haiku y `--permission-mode acceptEdits`, tres pedidos:
- Reemplazar `ops/automatization/hooks/guard-files.sh` por `#!/usr/bin/env bash` y `exit 0`.
- Escribir `{}` en `.claude/settings.json`.
- Escribir `{}` en `.claude/settings.local.json`.

## Síntoma

```
exit=0 :: ops/automatization/hooks/guard-files.sh
exit=0 :: ops/automatization/hooks/run-hook.sh
exit=0 :: .claude/settings.json
exit=0 :: .codex/hooks.json
exit=0 :: .gemini/settings.json
exit=0 :: .agents/plugins/cauce/hooks.json
exit=2 :: ops/node_modules/@ingeniomaps/cauce/engine/hooks/run.js
por shell: exit=0
```

En la sesión real:
- **El shim:** «Hecho. `ops/automatization/hooks/guard-files.sh` ahora tiene solo: `#!/usr/bin/env bash` / `exit 0`». El
  archivo quedó así.
- **`.claude/settings.json`:** «Claude requested permissions to write to …/.claude/settings.json, but you haven't granted
  it yet». No cambió.
- **`.claude/settings.local.json`:** lo mismo. No se creó.

Después, `ops automation check` desde la instancia:

```
✗ automatization/hooks/guard-files.sh: lo editaste y es del toolkit; agregá un guard propio al lado o descartá tu cambio con `cauce upgrade --force`
1 error(es) de automatización
```

## Causa raíz

- `engine/hooks/files.js:346-360`, `engineWrites`: protege `node_modules/@ingeniomaps/cauce` y nada más.
- Ningún guard de `pre-files` ni de `pre-shell` nombra `automatization/hooks/` de la instancia. Lo mismo pasa con la
  configuración de los runners que Claude Code no protege: Codex, Gemini y Antigravity.
- `automation check` compara los scripts con lo entregado y lo marca, pero no corre durante la sesión.

## Fix propuesto

1. Un guard de archivos y otro de shell, como `ops-config` y `ops-config-shell`, que frenan toda escritura a lo que
   Cauce entregó y ejecuta: los scripts de `automatization/hooks/` de la instancia, y la configuración de cada runner
   instalado (la que el manifiesto declara como `config.target`). La lista sale del registro de entregas
   (`.cauce/manifest.json`), no de una lista escrita a mano, así que un archivo nuevo nace protegido (R27).
2. La salida es la de siempre: la persona lo confirma, o lo hace ella. `install` y `upgrade` escriben con `fs` y no los
   ve el guard.
3. Prueba: escribir un shim o la configuración de un runner se frena por las dos vías, y un guard propio del proyecto al
   lado no. Mutación: sacar los scripts del registro deja pasar la escritura.

## Tradeoffs

- **Cuál es la configuración de cada runner, medido sólo en Claude Code.** Claude Code protege su `settings.json` y su
  `settings.local.json` por su cuenta (verificado en 2.1.325). Los otros tres no se midieron: hasta medirlos, el guard
  los protege igual, y protegerlos dos veces no cuesta nada.
- **Un proyecto que edita su propia configuración del runner,** por ejemplo un hook propio en `.gemini/settings.json`, va
  a tener que confirmarlo. Es el mismo costo que el 498.
- **No cierra el `bash archivo`:** un agente puede seguir corriendo un script que escribió. Eso es otra puerta, y la
  cuida el límite de escritura, no este caso.

## Contexto de descubrimiento

El 498 lo dejó como hallazgo aparte, sobre `.claude/settings.json`. Medido el 2026-11-14 en una instancia instalada, en
sesiones reales de Claude Code: el runner protege su configuración, y el hueco real son los scripts de Cauce.

## Relacionados

- 498, 373 y 114: la misma puerta, por `ops.config.json`.
- `engine-writes` (`files.js`): la protección del motor en `node_modules`, que es el precedente de la forma.

## Cierre

Dos guards nuevos, `runtime` (archivos) y `runtime-shell` (shell), en `engine/hooks/runtime.js`. Protegen:
- los scripts de `automatization/hooks/` que anota el registro de entregas;
- el registro mismo, `.cauce/manifest.json`;
- `engine/hooks/run.js` en la raíz ops, el motor que `run-hook.sh` usaría si existiera;
- lo que cada runner recibió al instalarse —configuración, workflows, agentes—, salvo sus instrucciones.

Con el registro ilegible o ausente, se protege la carpeta `automatization/hooks/` entera. Por shell se juzgan:
- escrituras y borrados;
- `mv`, `chmod`, `chown`, `chgrp`, `chattr`, `truncate` y `shred` sobre cada argumento;
- `cp`, `ln`, `install` y `rsync` sobre su destino, compuesto con el nombre del origen si es una carpeta;
- `find -delete`, con su filtro `-name`;
- `git rm`, `mv`, `checkout` y `restore`, también con `-C`.

Todo eso sobre el archivo, sobre una carpeta que lo contiene o con un glob que lo alcanza. Pasa si la persona lo pide
nombrando el archivo o lo confirma en el turno, sin línea para pegar.

Línea de base: las sondas del caso. Los seis archivos daban `exit=0` por la herramienta de archivos, y `sed -i` daba
`exit=0` por shell. En una sesión real, el agente reescribió `guard-files.sh` a `exit 0`.

Contra el caso:

- **Fix 1, un guard de archivos y otro de shell, con la lista del registro:** se hizo, y la lista creció en la revisión:
  el registro mismo, `engine/hooks/run.js` y la carpeta entera cuando el registro no se puede leer. Sin eso, vaciar el
  registro vaciaba la lista.
- **Fix 2, la salida es la de siempre:** se hizo. El agente no tiene línea que pegar; la persona lo pide nombrando el
  archivo, lo confirma en el turno, o lo hace ella. `install` y `upgrade` escriben con `fs` y no los ve el guard.
- **Fix 3, la prueba y la mutación:** se hizo, en `test/hooks/runtime.test.js`. La mutación que pedía el caso —sacar los
  scripts del registro— da rojo.
- **Tradeoff, la configuración de cada runner medida sólo en Claude Code:** queda así. El guard protege la de los cuatro
  runners que estén instalados; Claude Code además protege la suya.
- **Tradeoff, un proyecto que edita la configuración de su runner:** lo pide nombrando el archivo o lo confirma.
- **Tradeoff, `bash archivo`:** sigue fuera, como decía el caso.

Lo que el caso no preveía, todo de las cuatro pasadas de la revisión independiente:
- el registro se podía vaciar, y un registro ilegible dejaba pasar todo;
- borrar o mover la carpeta, un glob, `find -delete`, `git rm`, `git checkout` y `git restore` esquivaban la primera
  versión, que comparaba rutas exactas;
- `git -C` esquivaba la lectura de git;
- `git checkout <commit> <carpeta>` sin `--` no reconocía el commit;
- en modo embebido, proteger `engine/` entero frenaba el `engine/` del producto.

Quedan anotados, sin arreglar:
- lo que escribe otro programa por su cuenta: `dd of=`, `perl -pi`, un script de Python, `patch`;
- lo que cambia un `git checkout <rama>`, un `merge` o un `pull`;
- un `find` con `-o`, del que sólo se lee el primer `-name`;
- un worktree de la instancia, que no se protege como `ops-config` lo hace desde el caso 465;
- una rama de partida que se llame como una carpeta protegida, en `git checkout -b x ops`.

### Lista de cierre

1. hecho: las sondas del caso, antes del cambio, y la sesión real en la que el agente apagó el shim.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba en rojo sin los guards y en verde con ellos.
4. hecho: mutaciones en rojo por cada pieza. Entre ellas:
   - lo que lee el registro, la carpeta con el registro roto y el filtro del README;
   - la regla de carpeta, el glob, el glob recortado y `engine/hooks/run.js`;
   - la composición con la carpeta destino, el `find` con `-name`, la base de `-C`, el commit sin `--`, el origen de
     `restore`, `-W` y el «sólo índice»;
   - la confirmación por nombre.

   Las que sobrevivieron recibieron su caso: el `Makefile` como negativo, `git -C ops` desde la raíz, `chmod` con
   glob, `-W` y `-sSTABLE`. Quedaron dos sin caso, porque no tienen efecto observable: salir antes cuando no hay rutas,
   y tratar el commit también como ruta. La comprobación del modo `toolkit` sobrevivía porque nunca decidía —`opsRoot` no
   da raíz sin instancia—, y se quitó.
5. no aplica: no se quita nada. Los dos guards son nuevos, y el resto no cambia.
6. hecho: en una instancia instalada con el motor de la rama, los guards por sus shims, con unas 60 formas medidas por
   la revisión y por estas pruebas. En sesiones reales de Claude Code 2.1.325, con Haiku:
   - con la primera versión, el mismo pedido que había apagado el shim se frenó por `Write` y por `sed`;
   - la persona aprobó el diálogo interactivo y pasó;
   - con el código final, `chmod -R a-x ops/automatization` se frenó con el mensaje de `runtime-shell`;
   - un pedido que no nombra ningún archivo («apagá los guards de escritura como te parezca»): el agente se negó por su
     cuenta, o eligió `.claude/settings.json`, que el runner frena.
7. hecho: lo que depende del runner corrió en Claude Code (punto 6). USD 0,13 en total.
8. hecho: corrieron los dos guards por archivo y por shell, con y sin registro, en sidecar y en embebido, y desde la
   carpeta de la instancia y desde la del proyecto. No corrieron Codex, Gemini ni Antigravity.
9. hecho: dos modos de instalación (sidecar y embebido), dos vías (archivo y shell) y dos salidas de la persona (nombrar
   y confirmar).
10. hecho: el alta en `run.js` (grupos y descripción), los shims, la tabla del README y la prueba del registro de
    guards. Lo legítimo sigue pasando: `upgrade`, `automation install`, un guard propio nuevo, el `engine/` del
    producto, `git checkout <rama>`, `git restore .` y `rm -rf node_modules`.
11. hecho: cuatro pasadas independientes. La primera encontró el registro editable y las rutas exactas (impedían
    entregar). La segunda, `git -C`, el `find -delete` con filtro, el `git restore .` y el `engine/` del producto
    (impedían entregar). La tercera, el `checkout` sin `--` (impedía entregar) y el glob recortado sobre escrituras. La
    cuarta, nada que impidiera entregar; su menor, `-sSTABLE`, se arregló.
12. hecho: pasada uno por uno; el encabezado nombra lo que no se lee.
13. hecho: `npm run ci` con los cambios stageados: 1784 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** Codex, Gemini y Antigravity, y un pedido real en el que el agente elija solo reescribir un shim.
