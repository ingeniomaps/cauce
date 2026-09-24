---
caso: 201
titulo: `automation doctor` de Antigravity sondea la copia del workspace y no la que `agy` ejecuta, así que dice «operativo» con un plugin registrado de otro proyecto o roto
estado: abierto
prioridad: media
version-detectada: 0.98.0
---

# 201 — «Adaptador operativo» mientras `agy` corre otro plugin

**🔴 abierto** · detectado en 0.98.0 · prioridad **media**. Falla cerrado —el hook roto frena todo—, pero el
diagnóstico dice lo contrario de lo que pasa, y quien lo lee no tiene cómo saber qué registrar.

## Resumen

`agy` no ejecuta el plugin que `automation install` deja en `.agents/plugins/cauce/`: ejecuta la copia que registra
`agy plugin install .agents/plugins/cauce`, en `~/.gemini/config/plugins/cauce/`, **una por usuario** —lo dice
`automatization/runners/antigravity/README.md:11-20`—. `probeBridge` (`engine/automation/index.js`) sondea el
`hook.js` del workspace, así que `automation doctor` responde «adaptador operativo» aunque la copia registrada sea
de otro proyecto, de otra versión o esté rota. Nada compara las dos.

## Reproducción

En esta máquina, 2026-09-23/24, con `agy` 1.1.16:

1. El registro global de `cauce` era el de `aparatejo` (Cauce 0.22.0, importado el 2026-08-15), con el wiring
   viejo: `node .agents/plugins/cauce/hook.js pre-shell`, relativo al workspace.
2. En un banco con Cauce instalado (`automation install . antigravity`), `automation doctor . antigravity` dijo
   `✓ antigravity: adaptador operativo (0 advertencia(s))`.
3. `agy -p` en ese banco, pidiendo `git status` y `git push --force origin master`.

## Síntoma

`agy` corrió el plugin global con su carpeta como cwd, y el hook falló en cada llamada:

```
JSON hook "jsonhook__cauce_PreToolUse_0_0" failed: command failed: exit status 1, stderr: …
Error: Cannot find module '/home/manuel/.gemini/config/plugins/cauce/.agents/plugins/cauce/hook.js'
```

`agy` frenó todos los comandos, también `git status`: falla cerrado, pero ningún guard de Cauce juzgó nada. Con
el plugin del banco registrado (`agy plugin install .agents/plugins/cauce`), la misma sesión pasó `git status` y
negó el `push --force` con el motivo de Cauce.

## Causa raíz

- **`engine/automation/index.js`, `probeBridge`**: ejecuta `path.resolve(paths.install, bridge.target)`, la copia
  del workspace. La que corre `agy` es otra y no se mira.
- El README ya advierte que hay que volver a registrar cuando cambia el wiring o el proyecto, pero es prosa: nada
  detecta que no se hizo.

## Fix propuesto

Que `doctor` —y el cierre de `install`— compare la copia registrada con la del workspace: si
`~/.gemini/config/plugins/cauce/` no existe, falta registrar; si existe y difiere de `.agents/plugins/cauce/` —otro
`OPS_ROOT` en el `hook.js`, otro `hooks.json`—, avisa que `agy` va a ejecutar otra instalación y nombra el
comando que lo corrige. Y que el sondeo ejecute **la copia registrada**, con su carpeta como cwd, que es como la
lanza `agy`.

## Tradeoffs

- Leer `~/.gemini/config/plugins/` es mirar fuera de la instancia. Es de sólo lectura y es justo donde vive lo que
  se diagnostica.
- La ruta del registro global es la que documenta el README y la que se vio en esta máquina; si `agy` la cambia,
  el aviso tiene que decir que no la encontró, no que está todo bien.

## Contexto de descubrimiento

Pruebas reales en un banco instalado para cerrar la tanda 185-200 (ver el cierre del 198): la primera sesión
real de `agy` frenó todo con un `MODULE_NOT_FOUND` que no era de la rama sino del registro global de otro proyecto.

## Relacionados

- **198**, **200**: el puente que este registro deja sin ejecutar.
