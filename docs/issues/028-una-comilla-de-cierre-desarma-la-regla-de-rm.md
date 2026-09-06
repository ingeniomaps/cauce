---
caso: 028
titulo: Tres reglas de destructive anclan en espacio o fin, así que una comilla o un punto y coma las desarman
estado: resuelto
prioridad: alta
version-detectada: 0.61.0
resuelto-en: 0.62.0
---

# 028 — `rm -rf /; echo` pasa por el guard que existe para frenarlo

**🟢 resuelto en 0.62.0** · detectado en 0.61.0 · prioridad **alta** — tres reglas destructivas se esquivan sin herramientas

## Resumen

Tres reglas de la tabla de `destructive` deciden dónde termina una palabra admitiendo sólo un espacio,
el principio o el fin del comando. En un shell una palabra también termina en `;`, `&`, `|`, `)` y en
una comilla — y ahí las tres dejan de matchear.

No es una cita inerte lo que se escapa: en un comando que no es un commit, lo que va entre comillas **se
ejecuta**. `destructive` lo sabe y por eso no las vacía; su regla de publicación sí frena
`bash -c "git push origin main"`. Estas tres no llegan a esa comparación por su propio anclaje.

Y en el caso de `rm` no hacen falta ni comillas: **`rm -rf /; echo listo` pasa**, y `rm -rf / ; echo
listo` —con un espacio antes del punto y coma— cae. Lo que decide si se frena el borrado de la raíz es
un espacio.

## Reproducción

Una raíz mínima —un directorio con `ops.config.json` y `planning/`, que es lo que busca `findOpsRoot`
(`engine/hooks/input.js:113-124`)— y el guard a solas:

```bash
mkdir -p raiz/planning
echo '{"project":"d","mode":"sidecar","workspaceRoots":[{"name":"m","path":"."}],
 "runner":{"maxTaskHours":4,"humanCheckpointBetweenMilestones":true,"commitPerTask":true,"allowPush":false}}' \
  > raiz/ops.config.json

for cmd in 'rm -rf /' 'rm -rf /; echo listo' 'bash -c "rm -rf /"' '(rm -rf ~)' \
           'bash -c "git checkout -- ."' '(git checkout -- .)' \
           'bash -c "mkfs.ext4 /dev/sda1"' '(shred /dev/sda)'; do
  printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(node -p 'JSON.stringify(process.argv[1])' "$cmd")" \
    | CLAUDE_PROJECT_DIR="$PWD/raiz" node <ruta>/engine/hooks/run.js destructive >/dev/null 2>&1
  echo "exit=$? — $cmd"
done
```

## Síntoma

```
exit=2  rm -rf /
exit=0  rm -rf /; echo listo
exit=0  bash -c "rm -rf /"
exit=0  (rm -rf ~)
exit=0  bash -c "git checkout -- ."
exit=0  (git checkout -- .)
exit=0  bash -c "mkfs.ext4 /dev/sda1"
exit=0  (shred /dev/sda)
```

Las ocho reglas de la tabla, cruzadas contra las envolturas que un comando toma en la práctica. `cae` es
lo correcto; cada `PASA` es un hueco:

| regla | desnudo | `bash -c ""` | `sh -c ''` | `eval ""` | `; sigue` | `&& sigue` | `(subshell)` |
|---|---|---|---|---|---|---|---|
| reset | cae | cae | cae | cae | cae | cae | cae |
| amend | cae | cae | cae | cae | cae | cae | cae |
| clean | cae | cae | cae | cae | cae | cae | cae |
| **checkout** | cae | **PASA** | **PASA** | **PASA** | cae | cae | **PASA** |
| docker | cae | cae | cae | cae | cae | cae | cae |
| compose | cae | cae | cae | cae | cae | cae | cae |
| **disco** | cae | **PASA** | **PASA** | **PASA** | cae | cae | **PASA** |
| **rm** | cae | **PASA** | **PASA** | **PASA** | **PASA** | cae | **PASA** |

Cinco de las ocho están sanas, y no por suerte: sus anclajes son `\b` o `\s`, que no dependen de lo que
venga detrás de un argumento.

## Causa raíz

`engine/hooks/shell.js`, en la tabla de `destructive`. Las tres tienen la misma forma:

```js
// termina donde termina la palabra, y sólo acepta espacio o fin
/\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?:\s|$)/
// termina donde termina el comando, y sólo acepta fin o separador
/\bgit\s+(?:checkout|restore)\s+…(?:--\s*(?:$|[;&|])|…(?:\.|\*|:\/)\s*(?:$|[;&|]))/
// empieza donde empieza la palabra, y sólo acepta principio o espacio
/(?:^|\s)(?:mkfs\S*|shred)\s|…/
```

Los anclajes existen por una razón buena y hay que conservarla: separan `rm -rf /` de `rm -rf /srv/cache`
y `git checkout -- .` de `git checkout -- src/app.js`, que son trabajo corriente. Lo que está mal no es
que anclen, es **con qué**: la lista de lo que cierra una palabra en un shell es más larga que un espacio.

Es un anclaje, no una política. La política del guard es la contraria y está escrita: las comillas se
vacían **sólo** en un commit, precisamente para que un comando envuelto se siga juzgando.

## Fix propuesto

Dos cierres compartidos, y la distinción entre ellos es lo que evita el falso positivo:

```js
// Lo que un shell usa para separar. Las reglas admitían sólo `\s`, el principio y el fin.
const ANTES = String.raw`(?:^|[\s;&|('"\`])`
// Dos, y la diferencia importa. PALABRA termina una palabra: el espacio cuenta, porque después de una
// ruta un espacio la termina. COMANDO termina el comando: ahí el espacio **no** cuenta, porque `--`
// seguido de un espacio significa que viene un archivo nombrado, y revertir uno nombrado es trabajo
// corriente que esta regla no toca.
const PALABRA = String.raw`$|[\s;&|)'"\`]`
const COMANDO = String.raw`$|[;&|)'"\`]`
```

y las tres reglas pasan a usarlos: `rm` cierra con `(?=${PALABRA})`, `checkout` con
`(?=\s*(?:${COMANDO}))` en sus dos ramas —el `\s*` adentro del lookahead, no afuera— y `disco` abre con
`ANTES` en vez de `(?:^|\s)`.

Verificado sobre 25 casos antes de proponerlo, los dos lados: caen las siete formas envueltas de arriba
y siguen pasando `rm -rf /srv/cache`, `rm -r build/cache`, `rm -rf ./tmp`, `git checkout -- src/app.js`,
`git checkout rama-nueva`, `git restore src/app.js`, `echo mkfsdocs` y `cat informe-shredder.md`.

El `\s*` afuera del lookahead es la trampa de este fix y costó una vuelta: con `--\s*(?=…)`, el
cuantificador retrocede a vacío y el lookahead ve el espacio que él mismo habría consumido, así que
`git checkout -- src/app.js` empieza a caer. Adentro no puede retroceder a nada útil.

## Tradeoffs

Ampliar el cierre agranda lo que la regla alcanza, y acá el falso positivo se paga caro de otra manera:
un `rm -rf` frenado de más interrumpe trabajo legítimo, y un guard que interrumpe se apaga. Por eso los
casos que **no** deben caer son la mitad de la verificación y no una nota.

El mensaje de commit ya no dispara estas reglas desde 0.61.0, así que ampliar el cierre no revive ese
falso positivo: `git commit -m "no corras rm -rf /"` vacía sus comilladas antes de juzgarse.

Y queda dicho lo que este fix **no** hace: `rm -rf $DIR` con la variable armada dos líneas antes sigue
pasando, igual que en `shell-boundary`. Frena la forma habitual, que es el registro en el que trabaja
`destructive` — quien quiera pasar, pasa.

Va como un caso y no como tres, contra la costumbre de esta carpeta, porque no son tres defectos que se
arreglen por separado: es un anclaje escrito tres veces, y el arreglo es una definición compartida. Tres
casos cerrarían con el mismo commit.

## Contexto de descubrimiento

Arreglando el [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md) el 2026-09-06.
Al escribir un comentario que afirmaba «`bash -c "rm -rf /"` tiene que seguir cayendo», se comprobó antes
de darlo por cierto —R14— y resultó falso. El comentario se corrigió con el ejemplo que sí es cierto
(`bash -c "git push origin main"`), y el hueco quedó sin registrar hasta el final de esa sesión: se dijo
que se iba a abrir un caso y no se abrió, que es la ausencia que R15 nombra.

La primera versión de este archivo reportaba una sola regla y proponía un cierre único. Auditar la tabla
entera —lo que ese mismo texto decía que convenía hacer y nadie había hecho— encontró dos reglas más y
el caso de `rm` que no necesita comillas, que es el más fácil de escribir sin querer.

## Relacionados

- [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md) — la sesión donde apareció.
  No comparten causa: allá faltaba cobertura, acá un anclaje deja escapar lo que la regla ya cubre.
- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el otro caso sobre lo que un patrón
  sobre el texto de un comando puede y no puede ver.
