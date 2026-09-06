---
caso: 028
titulo: La regla de `rm -rf` exige espacio o fin después de la ruta, así que una comilla de cierre la desarma
estado: abierto
prioridad: alta
version-detectada: 0.61.0
---

# 028 — `bash -c "rm -rf /"` pasa por el guard que existe para frenarlo

**🔴 abierto** · detectado en 0.61.0 · prioridad **alta** — la regla más peligrosa del guard se esquiva con dos comillas

## Resumen

`destructive` bloquea `rm -rf /`, `rm -rf ~` y `rm -rf ..`, y lo hace exigiendo un espacio o el fin del
comando detrás de la ruta. Envuelta en comillas, detrás de la ruta viene una comilla — así que la regla
no matchea y el comando pasa.

Y no es contenido inerte: en un comando que no es un commit, lo que va entre comillas **se ejecuta**.
`destructive` lo sabe y por eso no las vacía; su regla de publicación sí frena `bash -c "git push"`. La
de `rm` no llega a esa comparación por su propio anclaje.

## Reproducción

Una raíz mínima —un directorio con `ops.config.json` y `planning/`, que es lo que busca `findOpsRoot`
(`engine/hooks/input.js:113-124`)— y el guard a solas:

```bash
mkdir -p raiz/planning
echo '{"project":"d","mode":"sidecar","workspaceRoots":[{"name":"m","path":"."}],
 "runner":{"maxTaskHours":4,"humanCheckpointBetweenMilestones":true,"commitPerTask":true,"allowPush":false}}' \
  > raiz/ops.config.json

for cmd in 'rm -rf /' 'bash -c "rm -rf /"' "sh -c 'rm -rf ~'" 'eval "rm -rf .."'; do
  printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(node -p 'JSON.stringify(process.argv[1])' "$cmd")" \
    | CLAUDE_PROJECT_DIR="$PWD/raiz" node <ruta>/engine/hooks/run.js destructive >/dev/null 2>&1
  echo "exit=$? — $cmd"
done
```

Control positivo: el mismo patrón sin comillas cae. Lo que cambia no es el comando sino su envoltorio.

## Síntoma

```
exit=2  rm -rf /
exit=0  bash -c "rm -rf /"
exit=0  sh -c 'rm -rf ~'
exit=0  eval "rm -rf .."
```

Comprobado también contra el regex a solas, sin el guard alrededor, para descartar que lo esté frenando
otra cosa: `RM.test('bash -c "rm -rf /"')` devuelve `false`.

## Causa raíz

`engine/hooks/shell.js`, en la tabla de `destructive`:

```js
[
  /\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?:\s|$)/,
  "'rm -r' sobre /, home o el directorio padre es catastrófico.",
],
```

El `(?:\s|$)` final existe por una buena razón: separa `rm -rf /` de `rm -rf /srv/cache`, que es trabajo
corriente y no se toca. Pero sólo admite dos cierres, y en la práctica hay un tercero —la comilla— que
aparece cada vez que el comando viaja adentro de `bash -c`, `sh -c` o `eval`.

Es un anclaje, no una política. La política del guard es la contraria y está escrita: las comillas se
vacían **sólo** en un commit, precisamente para que un comando envuelto se siga juzgando.

## Fix propuesto

Ampliar el cierre a los caracteres que de verdad terminan una ruta en un comando:

```diff
-  /\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?:\s|$)/,
+  /\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?=$|['"`\s;&|)])/,
```

Con `(?=…)` en vez de consumir: el cierre no forma parte de lo que se matchea, que es lo que permite
aceptar varios sin cambiar nada más.

Conviene revisar las otras reglas de la misma tabla con el mismo criterio antes de dar el caso por
cerrado: `git clean -[^\s]*f`, la de `docker` y la de `mkfs|shred|dd` no tienen este anclaje, pero
nadie las miró buscándolo.

## Tradeoffs

Ampliar el cierre agranda lo que la regla alcanza, y ahí el falso positivo es caro de otra manera: un
`rm -rf` bloqueado de más frena trabajo legítimo. Los cierres propuestos son los que terminan un
argumento en shell, así que no alcanzan a `rm -rf /srv/cache` —después de `/srv` no viene ninguno—,
pero eso hay que fijarlo con un caso y no suponerlo.

El mensaje de commit ya no dispara estas reglas desde 0.61.0, así que ampliar el cierre no revive ese
falso positivo: `git commit -m "no corras rm -rf /"` vacía sus comilladas antes de juzgarse.

Y queda dicho lo que este fix **no** hace: `rm -rf $DIR` con la variable armada dos líneas antes sigue
pasando, igual que en `shell-boundary`. Frena la forma habitual, que es el registro en el que trabaja
`destructive`.

## Contexto de descubrimiento

Arreglando el [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md) el 2026-09-06.
Al escribir un comentario que afirmaba «`bash -c "rm -rf /"` tiene que seguir cayendo», se comprobó
antes de darlo por cierto —R14— y resultó falso. El comentario se corrigió con el ejemplo que sí es
cierto (`bash -c "git push origin main"`), pero el hueco quedó sin registrar hasta ahora: se dijo que se
iba a abrir un caso y no se abrió, que es exactamente la ausencia que R15 nombra.

## Relacionados

- [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md) — la sesión donde apareció.
  No comparten causa: allá faltaba cobertura, acá un anclaje deja escapar lo que la regla ya cubre.
- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el otro caso sobre lo que un patrón
  sobre el texto de un comando puede y no puede ver.
