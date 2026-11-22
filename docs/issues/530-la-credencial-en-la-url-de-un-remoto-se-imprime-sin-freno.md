---
caso: 530
titulo: la credencial embebida en la URL de un remoto se imprime con `git remote -v` sin que ningún guard frene
estado: abierto
prioridad: alta
version-detectada: 0.123.1
---

# 530 — la credencial embebida en la URL de un remoto se imprime con `git remote -v` sin que ningún guard frene

**🔴 abierto** · detectado en 0.123.1 · prioridad **alta**: lo que se filtra es una credencial a la transcripción, y en
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
