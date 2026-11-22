---
caso: 530
titulo: la credencial embebida en la URL de un remoto se imprime con `git remote -v` sin que ningún guard frene
estado: resuelto
resuelto-en: 0.124.0
prioridad: alta
version-detectada: 0.123.1
---

# 530 — la credencial embebida en la URL de un remoto se imprime con `git remote -v` sin que ningún guard frene

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **alta**: lo que se filtra es una credencial a la transcripción, y en
una instancia real ya obligó a rotarla. El arreglo es acotado y no pide decisión de producto.

## Resumen

Un remoto HTTPS con el token en la URL (`https://usuario:<token>@host/org/repo.git`) es una forma común de autenticar
un push. `git remote -v`, `git remote get-url` y `cat .git/config` lo muestran entero, y los tres pasan `pre-shell` con
exit 0. `cat .env`, en el mismo banco, frena con exit 2: el guard de secretos cuida los archivos que enumera y el remoto
no está entre ellos. Tampoco hay ningún aviso en `check` ni en `secrets check` de que una raíz del workspace tiene una
credencial en un remoto.

## Reproducción

En un banco de medición (`node engine/cli/ops.js bench suelto`), con un remoto de token falso y un arnés que manda el
payload de `PreToolUse` con `cwd` al grupo `pre-shell` por `automatization/hooks/run-hook.sh`:

```bash
git -C "$BANCO" remote add origin https://usuario:ghp_FALSO0000000000000000000000000000000@github.com/acme/app.git
for c in 'git remote -v' 'git remote get-url origin' 'git config --get remote.origin.url' 'cat .git/config' 'cat .env'
do echo "== $c"; ./hook.sh "$BANCO" pre-shell "$c"; done
git -C "$BANCO" remote -v
```

## Síntoma

```
== git remote -v
exit=0
== git remote get-url origin
exit=0
== git config --get remote.origin.url
exit=0
== cat .git/config
exit=0
== cat .env
  …/suelto/.env
Cada línea vale hasta que alguien la borre, y lo que no esté ahí vuelve a frenar. …
exit=2
```

Y lo que el primero deja en la transcripción:

```
origin	https://usuario:ghp_FALSO0000000000000000000000000000000@github.com/acme/app.git (fetch)
origin	https://usuario:ghp_FALSO0000000000000000000000000000000@github.com/acme/app.git (push)
```

## Causa raíz

- `engine/hooks/files.js:53`: la lista de nombres de credencial (`.npmrc`, `.netrc`, `id_rsa`, `credentials`…) no
  incluye `.git/config`, que es donde git guarda la URL del remoto.
- `engine/hooks/secrets-shell.js:24-27`: `READERS` mira el verbo que muestra un archivo, así que un `git remote -v` —que
  no nombra ningún archivo— no tiene nada que comparar.
- `engine/hooks/line-scope.js:185` clasifica `git remote -v|show|get-url` como lectura, pero para el alcance de una
  línea, no para secretos. Un grep de `remote -v|get-url|userinfo` en `engine/` no da ningún otro uso.

## Fix propuesto

Que el guard decida por el hecho, no por el comando: ante un `git remote` que lista o muestra URLs (`-v`, `show`,
`get-url`), un `git config` que lee `remote.*.url`, o un lector de `.git/config`, el guard lee él mismo las URLs de los
remotos de ese repositorio (`git config --get-regexp '^remote\..*\.url$'`, local e inocuo) y frena **sólo si alguna trae
usuario y contraseña**. El mensaje nombra el remoto, nunca el valor, y dice la salida: pasar la credencial al helper de
git (`git remote set-url origin https://host/org/repo.git`). Lo que la persona pide en el chat pasa, como el resto de
`secrets-shell`.

Además, un aviso en `check` (o en `secrets check`) que recorre las `workspaceRoots` y nombra repo y remoto cuando la URL
trae credencial. Es la mitad que no depende de que alguien teclee el comando.

## Tradeoffs

- **Sin falsos frenos en el caso común**: un remoto sin credencial (SSH, HTTPS con helper) sigue pasando, porque el
  guard mira la URL y no el comando. Lo que hay que probar es justamente ese lado: que un `git remote -v` limpio no frene.
- **Es lectura de comandos**, con el límite que eso tiene (`automatization/hooks/README.md`): un `g=remote; git $g -v`
  pasa. La memoria del proyecto pide no pulir esa lectura salvo incidente real; acá hay uno.
- Un `git push` o `git fetch` que falla con la URL en el mensaje de error también la imprime, y esto no lo cubre. El
  aviso de `check` es lo que cierra ese lado: saca la credencial de la URL.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real. El 2026-10-29 un `git remote -v` de una sesión dejó un token
en la transcripción y hubo que rotarlo. La instancia escribió su propio guard sobre `git remote -v`, un enmascarador y
un aviso en su `check` que recorre los remotos. Ninguno de los tres sirve fuera de ella tal cual, porque dependen de sus
rutas.

## Relacionados

- 092 y 104: el guard de secretos nació mirando escrituras y después lecturas por shell; éste es un archivo que ninguna
  de las dos listas nombra.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, el guard decide por el hecho**: se hizo en `engine/hooks/secrets-shell.js` (`SHOWS_URL`, `remoteShown`,
  `remoteIn`) con `engine/core/remote-credentials.js`. Frena `git remote -v|--verbose|show|get-url`, `git config` que lee
  `remote.*`, `url` o lista todo, `git ls-remote --get-url` y un lector de `.git/config`, **sólo** si alguna URL de ese
  repositorio trae credencial. Se hizo distinto en un punto: también cuenta un token suelto como usuario (`ghp_…`,
  `github_pat_…`, `glpat-…` o 30 caracteres o más), no sólo usuario y clave, porque así se pega el token de GitHub. El
  repositorio es el que nombra el `-C`, o el de la ruta del `.git/config` que se lee. El mensaje nombra remoto y carpeta,
  nunca el valor, y da el `git remote set-url` con la URL limpia, también para `pushurl`. Se destraba con la línea en
  `.ops-approval`, como el resto de `secrets-shell`.
- **Fix propuesto, aviso en `check`**: se hizo, en `remoteWarnings`; recorre la instancia y las raíces declaradas.
- **Tradeoffs, sin falsos frenos**: hecho y probado. Un remoto SSH, uno HTTPS limpio y uno con usuario solo leen como
  siempre, y `git remote`, `git config user.name` y comandos encadenados con `-v` de otro programa pasan.
- **Tradeoffs, es lectura de comandos**: queda como decía el caso. Siguen pasando `g=remote; git $g -v`, `--git-dir` o
  `GIT_DIR` en vez de `-C`, un `-C` adentro de `bash -c`, `(cd x; git remote -v)`, `cd .git && cat config`, `insteadOf`,
  `git var -l` y `git config --get-regexp origin`. Frenan de más, sólo con credencial: `echo 'git config -l'` y
  `git config user.name "remote team"`. Con `/usr/bin/git -C <otro> remote -v` mira el repositorio de la sesión, porque
  `directoryFlag` sólo reconoce `git` a secas. No se pulió más: la memoria del proyecto lo pide, y la defensa que no
  depende de esto es el aviso de `check`.
- **Tradeoffs, el error de un push que falla**: no lo cubre el guard, como decía el caso. El aviso de `check` lo dice y
  manda a sacar la credencial de la URL.
- **Lo que el enunciado no preveía**: la primera versión tenía retroceso exponencial con muchos `-C` y colgaba el guard.
  Se cambió por `withoutGitGlobals`, y una prueba mide que 22 pares `-C -C` terminen en menos de 2 s.

Lo que se corrió:

- Línea de base, en «Síntoma»: `git remote -v` imprimía la URL con el token y nada frenaba.
- Después, `repro-530.sh` por el hook instalado en un banco (`repro-530-final.log` del scratchpad): `git remote -v`,
  `get-url`, `config --get remote.origin.url` y `cat .git/config` salen con exit 2 sin mostrar el token (0 apariciones);
  `git remote` y `git status` salen con 0; `check` avisa el remoto; con la URL limpia, `git remote -v` sale con 0.
- `test/hooks/remote-credentials.test.js`, 5 pruebas, en rojo contra HEAD y en verde después.
- 21 mutaciones en una copia, las 21 en rojo: 19 por `sed` y 2 por reemplazo literal.

**Sin probar:** un git con otra salida de `config --get-regexp`, y Windows.

### Lista de cierre

1. hecho: la reproducción de «Reproducción» en un banco, antes en «Síntoma» y después en `repro-530-final.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo contra HEAD y en verde después.
4. hecho: 21 mutaciones en una copia, las 21 rojas.
5. hecho: no quita nada; lo que deja pasar se asierta en la prueba de remotos limpios.
6. hecho: banco con el hook instalado, sin dobles; se midió que el token ya no sale y que lo limpio sigue pasando.
7. no aplica: el guard no depende de un modelo ni de un runner; el hook es el que instala `automation install`.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: dos remotos en un repositorio, uno con credencial y otro sin ella; un `-C` y un `.git/config` de otro repositorio; instancia y raíz declarada.
10. hecho: dependían `secretsShell`, `check` (`validate.js`) y el mensaje de aprobación; los tres se tocaron y se probaron.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
