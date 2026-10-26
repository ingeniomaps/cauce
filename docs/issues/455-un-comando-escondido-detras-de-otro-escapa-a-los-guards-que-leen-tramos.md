---
caso: 455
titulo: Un comando que corre escondido detrás de otro —`sh -c "…"`, `eval`, `env -S`, o un envoltorio que no está en la lista de prefijos como `stdbuf` o `sudo -T`— escapa a los guards que leen el comando por tramos (line-scope, los límites de escritura y borrado), porque `steps` sólo ve el verbo de afuera
estado: resuelto
resuelto-en: 0.117.0
prioridad: media
version-detectada: 0.116.0
---

# 455 — Un comando escondido detrás de otro escapa a los guards que leen tramos

**🟢 resuelto en 0.117.0** · detectado en 0.116.0 · prioridad **media**: cualquier agente que envuelve el comando —a propósito o
porque así lo escribe— en una cáscara, un `eval` o un envoltorio que el lector no conoce.

## Resumen

Los guards que juzgan dónde escribe, borra o qué checkout cambia un comando lo leen con `steps`
(`engine/hooks/shell-changes.js`): parten el comando en tramos, sacan los prefijos conocidos (`LEADING` y, desde el 454,
`VALUED`) y se quedan con el verbo y sus palabras. Lo que corre adentro de un string —`sh -c "…"`, `bash -lc '…'`,
`eval "…"`, `env -S "…"`— no se lee, y un envoltorio que no está en la lista (`stdbuf`, `ionice`, `taskset`, `flock`,
`setsid`, `doas`, o una bandera con valor que falta, como `sudo -T`) pasa a ser el verbo. En los dos casos el comando de
verdad no se juzga.

## Reproducción

Banco sidecar (`node engine/cli/ops.js bench sidecar --force`), con la línea `piloto` sobre `app`. Una sesión que dijo
`/autobuild piloto` y después «implementá la tarea», desde el árbol de la línea, en `bypassPermissions`. Y el guard de
límites desde la sesión principal, con una ruta fuera de las raíces.

## Síntoma

Medido el 2026-10-26, con el motor de `main` (`17a29fce`) y con el de la rama del 454; los dos dan lo mismo:

```
exit 2  git -C <banco>/app stash
exit 0  sh -c "git -C <banco>/app stash"
exit 0  bash -lc 'git -C <banco>/app stash'
exit 0  eval "git -C <banco>/app stash"
exit 0  env -S "git -C <banco>/app stash"
exit 0  stdbuf -oL git -C <banco>/app stash
exit 0  sudo -T 10 git -C <banco>/app stash
```

`shell-boundary`, desde la sesión principal:

```
exit 2  rm -rf $HOME/fuera-de-las-raices/sub
exit 0  sh -c 'rm -rf $HOME/fuera-de-las-raices/sub'
exit 0  stdbuf -oL rm -rf $HOME/fuera-de-las-raices/sub
```

## Causa raíz

- `engine/hooks/shell-changes.js` (`steps`): el verbo es la primera palabra que no es un prefijo de `LEADING` ni de
  `VALUED`, y el string de `-c`, `eval` o `env -S` es una palabra más.
- La lista de prefijos es abierta: lo que no está nace afuera, que es la forma que R27 describe.

## Fix propuesto

Dos partes, y la segunda pide una decisión:

1. Leer adentro: el string de `sh|bash|zsh|dash -c`, de `eval` y de `env -S` se vuelve a partir con `steps`, desde la
   misma carpeta y con el mismo entorno.
2. Para el envoltorio desconocido no hay lista que alcance. Las opciones: un comparador que recorra los envoltorios
   habituales y falle hasta clasificarlos (R27), o tratar como desconocido el verbo que no es un comando de la lista de
   los que se juzgan y lleva otro conocido entre sus palabras (`stdbuf -oL git …`).

## Contexto de descubrimiento

Las revisiones de código del arreglo del 454, el 2026-10-26. Cada pasada encontraba otro envoltorio; la clase es de
`steps`, no de `--git-dir`, y ya está en `main`.

## Relacionados

- 454: donde apareció; sumó `VALUED` para `sudo -u`, `env -u`, `nice -n`, `timeout`, `xargs`, `exec -a` y `time -f`.
- 423 y 365: los guards que esto rodea.

## Cierre

**Resuelto en 0.117.0.**

- **Leer adentro.** Se hizo, en `steps` (`engine/hooks/shell-changes.js`): el comando de `sh|bash|zsh|dash|ksh -c` y
  el de `eval` se vuelven a partir con `steps`, desde la misma carpeta y con el entorno que reciben, así que
  `GIT_DIR=… sh -c 'git stash'` también frena. Las opciones del shell se leen como las lee él —`-lc`, `-euo pipefail
  -c`, `-oc pipefail`, `-c -e`, `-c --`, `--rcfile x`—, y un shell con un script (`bash script.sh -c x`,
  `bash "rm -rf …"`) no se lee: ahí no hay comando. `env -S`, `flock -c` y `su -c`/`runuser -c` llevan su comando al
  mismo lugar. Lo que corre en otra máquina —`ssh`, `docker exec`, `kubectl exec`— no se lee, porque su verbo no es
  un shell.
- **El envoltorio desconocido.** Se decidió con el dueño del proyecto la lista declarada, no tratar como desconocido cualquier verbo
  que lleve otro comando entre sus palabras: eso frenaría `docker exec app rm -rf /app/x` y `echo git stash`. Se
  sumaron `stdbuf`, `ionice`, `taskset`, `chrt`, `flock`, `setsid`, `doas`, `unbuffer`, `su`, `runuser` y `builtin` con
  sus banderas con valor, y a `sudo` las que faltaban —`-T`, `-R` y sus largas—, y a `env`, `-a` y `-f`. Las banderas
  salen del `--help` de esta máquina; las de `sudo` que su versión no trae, del manual de sudo 1.9. El comentario de
  `LEADING` dice que es una lista y por qué. El comparador de R27 es la prueba que recorre cada nombre de las listas y
  de sus ejemplos: uno que se suma sin ejemplo nace en rojo, y uno que se saca de la lista también.

**Lo que no preveía:**

- **Las escrituras.** El enunciado nombraba los límites de escritura y midió sólo `git` y `rm`. Un `>`, un `tee` o un
  `cp` dentro de `sh -c` también pasaban, y no por `steps`: `writesWithBase` (`engine/hooks/shell-writes.js`) vacía
  las comillas antes de leer. Se arregló con `writes`, que suma lo que escribe cada comando escondido desde su carpeta,
  y lo usan los tres guards que leían `writesWithBase`: `shell-boundary`, `secrets-shell` y `ops-config-shell`.
- **`steps` sacaba las redirecciones también adentro de las comillas**, así que el `> f` de un `sh -c '…'` se perdía
  antes de leerlo. Ahora lo entrecomillado no se toca.
- **Cuatro pasadas de revisión de código**, y cada una encontró formas que la anterior no leía:
  - Las banderas de un prefijo se leen ahora como getopt: `sudo -iu root`, `env -S'…'`, `flock --command=…` y
    `sudo --chroot=/x` tomaban el usuario o el valor por el comando.
  - `su` y `runuser` son prefijos: el usuario es la palabra suelta, `runuser -u x -- cmd` corre `cmd` con sus palabras,
    y un `su` de inicio de sesión (`-`, `-l`, `--login`, también después de `-c`) y `sudo -i` o `sudo -R` corren en
    una carpeta que no se sabe: lo relativo no se juzga, y el entorno de afuera no llega a `su -`.
  - **Un defecto del 454:** `env -C` y `sudo -D` cambiaban la carpeta también para los comandos que seguían. Ahora
    valen sólo para el suyo.
  - `eval` corre en el mismo shell: su `cd` y su `export` valen para lo que sigue, también detrás de `if`, `!` o
    `builtin`, y no detrás de un prefijo que abre otro proceso. La asignación de delante (`X=1 eval …`) no queda.
  - Un `eval` anidado sin fin desbordaba la pila, y el guard salía con un error que no frena. Ahora, pasados 16
    niveles, frena diciendo por qué.
  - Lo mismo escrito por fuera y por dentro de un `eval` sin comillas se nombra una vez, y la lectura del comando se
    hace una vez por llamada aunque la pidan varios guards.
- **Lo que se decidió que no:**
  - El entorno que `sudo` limpia: qué variables pasan lo decide el `sudoers` de la máquina, no el comando, y el guard
    sólo lee el comando. Un `GIT_DIR` exportado antes de un `sudo` se le sigue atribuyendo al `git` de adentro.
  - Un `cd` con redirección que puede fallar: `writesWithBase` juzga las dos carpetas, y lo que se lee adentro de un
    `sh -c` desde ahí se juzga sólo en la nueva. Es como `steps` lee los borrados desde el 365.
  - Un `eval` en una tubería o en segundo plano corre en un subshell, y su `cd` igual se aplica a lo que sigue. Es como
    se lee hoy un `cd` en esa posición.
  - La marca con que se protege lo entrecomillado (`U+0001`) puede chocar con un comando que la traiga escrita; lo
    único que cambia es esa palabra, y ninguna prueba distingue el resultado.
- **El shell que lee el comando de su entrada** —`echo '…' | sh`, un heredoc o un here-string a `bash`— escapa igual,
  y ya pasaba en `main`. Salió como el caso 456, medido.
- **El comentario de `shell-writes.js`** que decía que `eval` y `bash -c` no se ven se corrigió: ahí siguen sin verse,
  y los lee `writes`.

La prueba:

- `test/hooks/line-scope.test.js`, prueba nueva: desde el árbol de la línea frenan, cada una en
  `git stash @ <checkout>`, `sh -c`, `bash -lc`, `eval`, `env -S`, `stdbuf`, `sudo -T`, `flock -c`, `su -c`, un
  `GIT_DIR` que llega a un `sh -c`, un `cd` adentro, un `eval` dentro de un `sh -c`, un `export` en un subshell y un
  `export` dentro de un `eval`; y pasan `ssh`, `docker exec … sh -c`, un commit que cita un `sh -c`, un `status`, un
  `echo`, un `stash` propio, un `su -` con `GIT_DIR` exportado afuera y `GIT_DIR=… eval true`. Más `printf -v` entre los
  que no se pueden ubicar.
- `test/hooks/removal-boundary.test.js`: los borrados, creaciones y escrituras escondidos de cada forma de arriba
  frenan; las formas legítimas —otra máquina, texto, un script, lo de adentro de `runuser -u … --`, una función antes
  de un `eval`— pasan; lo relativo de `su -`, `sudo -i` y `sudo -R` no se juzga, y un `eval` de 2000 niveles frena.
  Cada envoltorio de las listas frena con su ejemplo.
- `test/hooks/secrets-shell.test.js` y `test/hooks/roots-declared.test.js`: una credencial y `ops.config.local.json`
  escritos dentro de `sh -c`, `eval` y `bash -c` frenan.
- Con el motor de `main`, las cinco pruebas dieron rojo.
- En una copia, 49 mutaciones dieron rojo, una por pieza: cada envoltorio y cada bandera con valor nuevos, la palabra
  suelta de `taskset`, `chrt`, `flock` y `su`, la lectura de las opciones del shell (`c`, cada `o`, `--rcfile`, el
  script que corta), `eval`, leer adentro y el entorno que recibe, el tope de anidado, getopt (grupo, valor pegado,
  larga con `=` y en la palabra siguiente), `env -S`, el `-c` de `flock` y `su`, la carpeta que no se sabe de `su -`,
  `su -l`, `su -c … -`, `sudo -i`, `sudo -R` y `--chroot`, que la carpeta de un prefijo no siga a los demás, el entorno
  limpio de `su -`, `runuser -u`, el estado que deja un `eval` (carpeta, entorno, asignación de delante, detrás de un
  prefijo, con una función antes, `builtin`), la carpeta de las escrituras de adentro, no tocar lo entrecomillado y
  sumar las escrituras de adentro. Las que sobrevivieron en el camino marcaron código que sobraba —dos líneas que el
  resto ya cubría y `su` y `runuser` repetidos en `LEADING`—, y se quitó; y una forma sin prueba, `bash "rm -rf …"`,
  que se sumó.
- `npm run ci`: 1626 de 1626, con la cobertura de `shell-changes.js` sobre su piso.
- **Sesión real** de Claude Code 2.1.310, `claude -p` en `bypassPermissions`, en un banco instalado con el motor de la
  rama y la sesión atada por un `/autobuild piloto` real, con `principal.txt` sin commitear en el checkout principal.
  El paso 1, `sh -c "git -C <banco>/app stash -u"`, frenó con «`<banco>/app` es el checkout de la sesión principal, y
  `git stash` le cambia su rama…», ofreciendo `git stash @ <banco>/app`; el stash siguió vacío y `principal.txt`, en su
  lugar. La sesión no siguió con los pasos 2 y 3 porque eran el mismo cambio, y se corrieron después, con el motor
  final y autorizados por el dueño del proyecto, cada uno en una sesión propia atada a la línea: `stdbuf -oL git -C
  <banco>/app stash -u` y `eval "git -C <banco>/app stash -u"` frenaron con el mismo mensaje, y el stash del checkout
  principal siguió vacío con `principal.txt` en su lugar. Pasados al hook instalado del banco, los tres frenaron
  (`exit 2`) y `git -C <banco>/app status` pasó; con el motor de `main` en el mismo banco, los tres pasaron (`exit 0`).
