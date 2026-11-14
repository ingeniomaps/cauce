---
caso: 508
titulo: El agente puede reescribir los scripts que corren los guards, y apagarlos para el resto de la sesión
estado: abierto
prioridad: alta
version-detectada: 0.119.0
---

# 508 — El agente puede reescribir los scripts que corren los guards, y apagarlos para el resto de la sesión

**🔴 abierto** · detectado en 0.119.0 · prioridad **alta**: una sola escritura apaga un grupo entero de guards, sin
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
