---
caso: 405
titulo: escribir un archivo de credenciales desde el shell no lo frena ningún guard, aunque con las herramientas de edición sí
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 405 — `files.js` frena editar `.npmrc`, `.netrc` o `id_rsa`, pero sólo con las herramientas de edición: `echo … > .npmrc` pasa

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. La defensa existe para un camino y no para el otro, y el
que queda abierto es el que un agente usa sin pensarlo.

## Resumen

`engine/hooks/files.js:49` frena la escritura de los archivos de credenciales que mantiene su herramienta —`.npmrc`,
`.netrc`, `_netrc`, `.pypirc`, `.dockercfg`, `id_rsa` y sus variantes, `credentials`— con «es un archivo de
credenciales que su herramienta mantiene. No lo edites a mano.». Ese guard se aplica a las herramientas de edición.

Desde el shell, las escrituras las junta `writesWithBase` (`engine/hooks/shell.js:413`), y las leen `shell-boundary`
(`:428`) y `ops-config` (`engine/hooks/ops-config.js:172`). Ninguno de los dos mira si el destino es un archivo de
credenciales. Lo único que hoy frena `cat > .npmrc` es `secrets-shell`, y por una razón equivocada: lo toma como una
lectura (caso 402).

Es la forma de R27: la defensa es una lista de caminos, y el camino que no está en la lista nace abierto.

## Reproducción

Medido el 2026-10-19 con el motor del repositorio en 0.111.0, `execute(<guard>, …)` con un payload de Bash sobre un
repo vacío:

```
secrets-shell  PASA  | echo "//r/:_authToken=x" > .npmrc
shell-boundary PASA  | echo "//r/:_authToken=x" > .npmrc
secrets-shell  FRENA | cat > .npmrc <<EOF        (como lectura: caso 402)
shell-boundary PASA  | cat > .npmrc <<EOF
```

## Causa raíz

La regla de nombres vive en `files.js:49` y sólo la consulta el guard de las herramientas de edición. `shellBoundary`
(`engine/hooks/shell.js:428-445`) juzga cada destino de `writesWithBase` contra las raíces escribibles y contra el canal
de aprobación (`selfApprovalShell`), pero no contra esa regla.

## Fix propuesto

**Pide una decisión antes de construir:** si escribir un archivo de credenciales desde el shell se frena igual que con
las herramientas de edición, con la misma aprobación del caso 117.

Si se decide que sí: que `shellBoundary` aplique a cada destino la misma regla de `files.js`, importada y no copiada
—una copia dejaría de reconocer un nombre y el guard dejaría pasar en silencio—, con la misma salida aprobable.

La aceptación pide la mutación: con la comprobación quitada, la prueba `echo x > .npmrc` pasa y falla; y `echo x >
notas.txt` tiene que seguir pasando.

## Tradeoffs

- Sólo ve lo que tiene forma de redirección o de destino conocido: un `node -e` que escribe el archivo, o un
  `npm config set`, siguen pasando. Esa frontera ya la tiene `files.js` («Qué son y qué no son» en el README de los
  guards) y hay que decirla igual.
- `npm login` y `npm config set` son la forma legítima de escribir `.npmrc`, y no pasan por una redirección: frenar la
  redirección no los toca.

## Contexto de descubrimiento

Al revisar el caso 402, el 2026-10-19: su arreglo proponía «dejar que lo juzgue el guard de escritura», y medirlo
mostró que en el shell ese guard no existe.

## Relacionados

- 402 — `secrets-shell` lee `cat > .npmrc` como lectura; arreglarlo solo le quita a ese camino la única defensa que
  tiene, así que va después de éste o junto.
- 117 — la aprobación de la escritura de un archivo de credenciales.

## Cierre

**Resuelto en 0.112.0.** La decisión que el caso pedía se tomó en el sentido de lo que ya regía: escribir una
credencial desde el shell se frena igual que con las herramientas de edición, con la misma regla y la misma
aprobación. No es una política nueva, es la que ya existía cubriendo el camino que había quedado afuera. Lo hace
`secrets-shell` (`writtenCredentials`, `engine/hooks/secrets-shell.js`), que ya era el guard de credenciales del
shell, sobre los destinos que da `writesWithBase` y con `credential()` de `files.js`, importada y no copiada.

El enunciado, ítem por ítem:

- **La decisión**: tomada, como arriba.
- **Que `shellBoundary` aplique la regla de `files.js`**: se hizo distinto. Va en `secrets-shell` y no en
  `shellBoundary`, que juzga raíces y saltea lo que no tiene raíces declaradas o cae en el temporal; una credencial
  se frena en cualquier raíz. La regla se importa (`credential`), así que no hay copia que se pudra; la excepción del
  `.env`, desde el 417, es propia de este guard.
- **La misma salida aprobable**: sí, `AP.HOW(null, …)` como `secrets`, sin variable de entorno. Y
  `OPS_SECRETS_READ_OVERRIDE`, que apaga la lectura, no apaga esto.
- **La mutación del caso**: `echo x > .npmrc` deja de frenar sin la comprobación, abajo; `echo x > notas.txt` sigue
  pasando, en la misma prueba.
- **Tradeoff, `node -e` o `npm config set` siguen pasando**: así quedó, y lo dice el README de los guards en su
  sección nueva, «Escribir una credencial desde el shell».
- **Tradeoff, `npm login` no pasa por una redirección**: leído en `writeTargets` (`engine/hooks/shell.js`), no corrido: el
  guard mira los destinos de redirección, `tee`, `cp`/`mv`/`install`/`rsync`, `truncate` y `sed -i`, y `npm login` no
  usa ninguno.

Lo que el caso no preveía: `credential()` también marca el `.env`, y una prueba existente fijaba que `cp .env.example
.env` pasa. Aplicar la regla entera habría frenado el paso de setup de casi todo repositorio, y un freno que salta
siempre se termina apagando. **La familia `.env` es la única excepción**, declarada en el código con su razón. Leerla
sigue frenando. Escribirla con la herramienta de edición también, como antes: esto no cambia `secrets`.

**Lo que se corrió para saber que funciona.**

- `test/hooks/secrets-shell.test.js`, «secrets-shell frena escribir una credencial por shell como escritura, y no como
  lectura»: seis formas de escribir (`>`, heredoc, `>>` en `~`, `tee`, `cp`, después de un `cd`) frenan como escritura
  y ninguna dice «lee»; las lecturas siguen frenando como lectura; el `.env`, `notas.txt` y `.npmrc.md` pasan; la
  variable de lectura no la apaga; se aprueba por archivo y por el chat. Roja antes del cambio (`Missing expected
  exception`).
- Mutaciones en una copia fuera del árbol, las cuatro en rojo: sin la comprobación de escritura; sin la excepción del
  `.env` (`Got unwanted exception: cp .env.example .env`); con la variable de lectura antes de la escritura.
  La cuarta es la del 402, que tiene su propio cierre.
- Real, el grupo `pre-shell` entero como proceso (`engine/hooks/run.js pre-shell` con el payload del runner) sobre
  `ops bench suelto`, con el motor de `main` y con el de la rama:

  ```
  == main
  exit=0 | echo "//r/:_authToken=x" > .npmrc |
  exit=2 | cat > .npmrc <<EOF                | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=2 | cat > .env <<EOF                  | BLOQUEADO: el comando lee <banco>/.env, que es una credencial: …
  exit=0 | cp .env.example .env              |
  exit=2 | cat .npmrc                        | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=0 | echo hola > notas.txt             |
  == rama
  exit=2 | echo "//r/:_authToken=x" > .npmrc | BLOQUEADO: <banco>/.npmrc es un archivo de credenciales que su herramienta …
  exit=2 | cat > .npmrc <<EOF                | BLOQUEADO: <banco>/.npmrc es un archivo de credenciales que su herramienta …
  exit=0 | cat > .env <<EOF                  |
  exit=0 | cp .env.example .env              |
  exit=2 | cat .npmrc                        | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=0 | echo hola > notas.txt             |
  ```

**Lo que encontró la revisión del conjunto**, antes del PR, y se arregló acá:

- **Un commit en el mismo comando apagaba la escritura.** `secretsShell` sólo llamaba a `writtenCredentials` si el comando no
  era un commit, una condición copiada del lado de la lectura sin razón escrita. `git commit -m wip && echo … > .npmrc` y la
  forma inversa pasaban. Ahora se juzga siempre; el mensaje del commit no cuenta como escritura porque `writesWithBase` lee
  sin lo entrecomillado, y así siguen pasando `-m "… > .npmrc"` y un `-F -` con heredoc.
- **`>` pegado a lo de antes no se veía.** `REDIRECT` exigía un espacio o un `(` antes del `>`: `echo x>.npmrc` y
  `cat>.npmrc <<EOF` pasaban, y el segundo se leía como lectura, que la variable de lectura apaga. Viene de antes de la rama, y
  alcanzaba también a `shell-boundary`. Ahora lo de antes se mira sin consumirlo (`a>b>c` ve los dos destinos), y siguen
  afuera `2>&1`, `>&2`, `>(…)`, `<>` y lo entrecomillado.
- **Bajo un `cd` que no se resuelve, el destino se juzgaba contra el cwd**: una carpeta inventada, en el mensaje y en la
  aprobación. Ahora se juzga por el nombre, y no se ofrece aprobación por archivo, porque no hay ruta que nombrar. Pasa si
  la persona lo pidió en el chat nombrándolo. Y `cdTarget` (`shell-writes.js`) expande `$HOME`, como ya hacía
  `writeTargets`: `cd "$HOME/x"` se resuelve y se aprueba como cualquier ruta.
- **Salió como caso propio, el 417, y se hizo ahí: la excepción de la familia `.env`.** La revisión marcó que exime toda escritura de
  `.env.*` por el shell —también `.env.keys` o `.env.production`— mientras el guard de edición la frena. Es la excepción que
  este caso decidió, con su razón, y achicarla era una decisión de producto: se tomó y se hizo en el caso 417, que la dejó en `.env` y `.env.local`.

Probado así: `test/hooks/secrets-shell.test.js`, «secrets-shell juzga la escritura de una credencial aunque el comando commitee,
y no la ubica bajo un cd perdido». Mutaciones en una copia, cada una en rojo con su mensaje: sin juzgar con un commit («Missing
expected exception»), `REDIRECT` con el espacio de antes, el `cd` perdido resuelto contra el cwd («se le inventó una
carpeta»), sin `$HOME` en `cdTarget` y sin la salida por el chat («Got unwanted exception»). Real, con `claude -p` en una
instancia instalada desde el tarball: `echo x>app/.npmrc` y la escritura de `app/.npmrc` se niegan con código 2, y
`git commit -m "fix: stop writing > .npmrc"` pasa.

Las pruebas de `secrets-shell` —las de este caso, las del 402 y las del 287— salieron de `test/hooks/chat-effects.test.js` a
`test/hooks/secrets-shell.test.js` cuando aquélla pasó las 500 líneas con las nuevas: es un guard con sus propias pruebas, y lo
que comparten es sólo el ayudante del chat. Se movieron enteras, con sus nombres: las dos suites juntas siguen siendo las
mismas 14.

**Lo que encontró la tercera revisión**, sobre los arreglos de la segunda, y se arregló acá:

- **`>&` hacia un archivo no se veía.** `echo $T >&.npmrc` escribe `.npmrc`. `REDIRECT` descartaba todo `>&`, y además
  `writesWithBase` partía el comando en cada `&`, también en el de `>&`. Ahora `>&` seguido de algo que no es un descriptor ni `-`
  es una escritura, y el corte no se hace en el `&` que sigue a un `>`. `>&2`, `2>&1` y `>&-` siguen sin destino.
- **El cuerpo de un heredoc con un delimitador como `END-1` se leía como comandos**: crear un script que nombra `~/.npmrc`
  frenaba, en `secrets-shell` siempre y en `shell-boundary` y `ops-config-shell` con raíces declaradas. `commandOf` ya sacaba
  el cuerpo con delimitadores de letras; los tres usan ahora `asRead`, que reconoce los otros.
- **`$HOME` en `cdTarget`, mal leído en dos formas que trajo el cambio de la segunda revisión**: entre comillas simples
  (`cd '$HOME'`), que es una carpeta que se llama así, y con las llaves desparejas (`$HOME}`, `${HOME`). `QUOTED_CD` ya no saca
  las comillas simples si adentro hay un `$`, y la expansión es una sola, `HOME_VAR`, la misma en `writeTargets`.
- **Un `cd` absoluto después de uno desconocido no volvía a dar base** en `writesWithBase`, mientras `removal.js` y
  `shell-changes.js` sí. `cdTarget` acepta ahora una base desconocida y devuelve igual lo que no depende de ella.
- **Lo que le tocaba a otro**: `removal.js` resolvía un `cd` solo contra el directorio de antes. Es un defecto propio,
  anterior a la rama, y salió como el caso 418.

Probado así: `test/hooks/command-reading.test.js`, «los destinos y los cd se leen como los lee el shell», y la prueba de
escritura de este caso con el heredoc `END-1`. Mutaciones en rojo, una por arreglo: `REDIRECT` sin el `>&`, el corte en todo
`&`, las comillas simples sacadas, las llaves desparejas, la base nula que se queda nula y `writtenCredentials` sin `asRead`.
El grupo `pre-shell` como proceso, sobre 109 comandos, contra una copia sin los cambios de `REDIRECT` y `$HOME`: 14 salidas
distintas y ninguna que pase de frenar a dejar pasar. Son cinco escrituras que ahora frenan (las tres redirecciones pegadas y
los dos `>&`), ocho que ya frenaban y ahora nombran la ruta resuelta en vez de «destino que no se puede resolver», y el
heredoc `END-1`, que dejó de frenar. Real, con `claude -p` en la instancia instalada desde el tarball: `echo … >&app/.npmrc`
sale negado, y `cat > app/setup.sh <<END-1` con un `> ~/.npmrc` adentro crea el script sin tocar `~/.npmrc`. Y la sonda
corta con los otros tres runners, `echo x>app/.npmrc` y la escritura encadenada a un commit: negadas las dos con agy 1.4.3,
con Codex 0.162.1 y con Gemini 0.63.0, éste con la carpeta de confianza (ver el caso 406).

**Lo que encontró la cuarta revisión**, sobre los arreglos de la tercera, y se arregló acá:

- **Una escritura después de un `cd` con redirección** (`cd ../ 2>/dev/null && echo x > f`) se juzgaba en la carpeta de antes.
  Ahora se juzga en las dos, como el borrado del caso 418.
- **Un dígito pegado a una palabra se tomaba por descriptor.** Con el lookbehind de la segunda revisión, `cat cert.pem2>/dev/null`
  sacaba `2>/dev/null` y leía `cert.pem`, una credencial, cuando bash lee `cert.pem2` (comprobado: `cat /etc/hostname2>out`
  crea `out` y lee `hostname2`). Ahora el descriptor tiene que ser un número suelto.
- **Detrás de `>&`, un descriptor de varios dígitos** (`exec 3>&10`) **o seguido de otra redirección** (`>&2>/dev/null`) se
  leía como un archivo.
- **Se decidió que no: que `--format=%h->%s` sin comillas sea una escritura.** La revisión lo leyó como un falso positivo,
  pero bash lo hace: `echo hola --format=%h->%s` crea un archivo `%s` (comprobado). Leerlo así es lo correcto.
- **Se decidió que no: juntar en una sola las tres formas de partir un comando y las dos regex de redirección.** El
  encabezado de `shell-changes.js` dice por qué tiene su propia lectura: compartirla costó tres regresiones de `destructive`.
  Lo que sí se compartió es `REDIRECTIONS` (caso 418), con el mismo valor que ya tenía.

Probado así: `test/hooks/command-reading.test.js` suma `exec 3>&10`, `>&2>/dev/null`, `file2>out` y el `cd` con redirección.
La prueba de este caso suma `cat cert.pem2>/dev/null`, que pasa. Mutaciones en rojo: sin sacar las redirecciones del `cd`,
sólo la carpeta nueva, el dígito pegado como descriptor (que sobrevivió hasta que se le escribió la prueba de lectura: en
`writesWithBase` el destino es el mismo) y `>&` de un solo dígito. El grupo `pre-shell` como proceso: las 109 salidas de la
ronda anterior, idénticas, y las siete formas nuevas como corresponde. Real, con `claude -p`: `cd /var/tmp 2>/dev/null &&
echo x > w407-fuera.txt` sale negado y el archivo no existe; `cat app/cert.pem2>/dev/null` se hace.
