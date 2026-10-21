---
caso: 425
titulo: el reintento de release.yml vuelve a publicar lo que npm todavía no muestra, y cae en rojo después de correr la puerta entera
estado: resuelto
resuelto-en: 0.113.2
prioridad: baja
version-detectada: 0.113.0
---

# 425 — Reintentar `release.yml` enseguida de un publish que salió lo lee como «no publicado», corre `npm run ci` y termina en «cannot publish over»

**🟢 resuelto en 0.113.2** · detectado en 0.113.0 · prioridad **baja**. No publica nada dos veces —npm lo impide— ni deja nada roto:
cuesta una corrida en rojo de unos tres minutos y un tercer intento. Pero contradice lo que el workflow y `AGENTS.md`
prometen del reintento.

## Resumen

`Decide what this version still needs` (`.github/workflows/release.yml:52`) decide qué falta preguntando primero por el
tag (`:58`) y después a npm (`:64`): si `npm view <paquete>@<versión> version` devuelve la versión, marca
`published=true` y el reintento salta el publish. El registro tarda en mostrar una versión recién publicada, y en ese
intervalo `npm view` contesta 404. El paso lo lee como `published=false`, `Publish to npm` (`:97`) corre otra vez,
`prepublishOnly` corre `npm run ci` entero y recién al final npm rechaza la versión. `Create GitHub release` queda
salteado, así que el reintento no hace lo único que le faltaba.

Lo mismo pasa con cualquier falla de `npm view`, no sólo con la demora: el `2>/dev/null` de `:64` vuelve indistinguibles
«no existe» y «no pude preguntar».

El comentario de `:19` —«Es idempotente: lo ya publicado o tagueado se reconoce y no se repite»— y la línea de
`AGENTS.md` sobre reintentar («reconoce lo que ya salió y no lo repite») son ciertos sólo pasado ese intervalo.

## Reproducción

El 2026-10-21, al publicar 0.113.0 (merge del PR #833). Tiempos de los pasos, de `gh run view --json jobs`:

```
corrida 39636859132 (push del merge)
  Decide …           16:40:30 → 16:40:31  success   published=false
  Publish to npm     16:40:31 → 16:43:29  success
  Create GitHub release 16:43:29 → 16:43:30  failure   HTTP 500 (https://api.github.com/repos/ingeniomaps/cauce/releases)

npm view @ingeniomaps/cauce@0.113.0 version, local, 16:43:52 y 16:44:10   →  npm error 404

corrida 39637439349 (gh workflow run release.yml, 16:44)
  Decide …           16:44:20 → 16:44:21  success   published=false
  Publish to npm     16:44:21 → 16:46:59  failure
      npm error You cannot publish over the previously published versions: 0.113.0.
  Create GitHub release                    skipped

npm view @ingeniomaps/cauce time   →  "0.113.0": "2026-10-21T16:44:48.103Z"

corrida siguiente (gh workflow run release.yml, 16:47)
  Publish to npm     skipped
  Create GitHub release  success   v0.113.0 2026-10-21T16:47:32Z
```

El publish terminó 16:43:29, y el registro fecha la versión 16:44:48: unos 80 segundos en los que el reintento no la
ve. El de 16:44:20 cayó adentro. El HTTP 500 de la primera corrida es de GitHub y no es parte de este caso: es sólo lo
que hizo falta para que hubiera algo que reintentar.

## Qué haría falta

- Que un publish rechazado porque la versión ya existe cuente como publicado y siga a la release. Una forma: si
  `npm publish` falla, volver a preguntar con `npm view` —con unos reintentos espaciados— y seguir si la versión está.
  Otra: esperar en `Decide …` cuando falta el tag y npm no la muestra. Ésta demora cada primera publicación, que es el
  caso común, para cubrir el raro; hay que medir cuál conviene.
- Distinguir en `:64` el 404 de cualquier otra falla de `npm view`, en vez de tratarlas igual con `2>/dev/null`.
- Mirar si se puede saber que la versión ya existe antes de `prepublishOnly`, para no pagar `npm run ci` entero en un
  publish que va a ser rechazado.
- Corregir lo que afirma la idempotencia sin la salvedad: el comentario de `release.yml:19` y la línea de `AGENTS.md`
  sobre reintentar con `gh workflow run release.yml`.
- El cambio toca `.github/workflows/`: se empuja por SSH y lo mergea el dueño.

## Cierre

**Resuelto en 0.113.2**, a pedido del dueño el 2026-10-21 («arregla el 425»). `release.yml` no viaja en el paquete:
`files` de `package.json` deja fuera `.github/`. Por eso este cambio no llevaba entrada propia en el CHANGELOG, y el plan
era cerrarlo en la próxima versión que se abriera por otra cosa.

**La 0.113.1 salió sin él, y fue un error.** El PR #834 seguía abierto cuando se mergeó la release de la 0.113.1, que
salió con el 426 y dejó este caso afuera. Se vio antes del merge y se avisó recién después de publicar. El dueño decidió
sacar la 0.113.2 para dejar todo al día en `main`. Su entrada en el CHANGELOG avisa a quien actualiza que no cambia nada
de lo que recibe.

- `Decide what this version still needs` lee de npm sólo el E404 como «no está». Cualquier otra falla frena con lo
  que contestó npm y «No se pudo preguntarle a npm si <versión> ya salió, y sin saberlo no se publica».
- `Publish to npm` (`id: publish`): si npm rechaza con «cannot publish over the previously published versions», el paso
  pregunta al registro hasta seis veces, cada 20 segundos, y con la versión a la vista sigue a la release. Sin verla,
  frena: no se anuncia lo que todavía no se puede instalar. Cualquier otra falla sale como antes, con su código, sin
  preguntar nada.

El enunciado, ítem por ítem:

- **Que el rechazo por versión existente cuente como publicado**: se hizo con la primera forma, volver a preguntar
  después del rechazo. La segunda, esperar en `Decide …`, demoraba toda primera publicación para cubrir el reintento,
  que es lo raro. El rechazo se reconoce por su frase: si npm la cambia, el paso vuelve a caer en rojo como antes, que
  es la dirección segura, y lo que decide seguir es igual el registro mostrando la versión.
- **Distinguir el 404 de otra falla de `npm view`**: se hizo, en `Decide …`. En el bucle de confirmación se deja
  `2>/dev/null`, porque ahí cualquier respuesta que no sea la versión significa lo mismo: todavía no se ve.
- **Saber antes de `prepublishOnly` que la versión ya existe**: se decidió que no. En ese intervalo el registro contesta
  E404, igual que para una versión que nunca salió, así que no hay nada que distinga los dos casos antes de que npm
  rechace. El reintento hecho en ese intervalo sigue pagando la puerta entera, unos tres minutos, y ahora termina en
  verde con la release creada.
- **Corregir lo que afirma la idempotencia**: el comentario de `release.yml:19` dice que lo que npm todavía no muestra
  se reconoce al rechazarlo, y `AGENTS.md` lo mismo, con el costo de la puerta.
- **Empujar por SSH y que lo mergee el dueño**: se hizo distinto. Por SSH, GitHub lo rechazó: la clave autentica como
  una cuenta sin permiso en este repositorio. Se empujó por el remoto HTTPS con la credencial del proyecto, como los
  workflows anteriores, y el dueño lo eligió así. El merge se hizo por su orden de dejar todo en `main` con la 0.113.2.

**Lo que se corrió para saber que funciona.**

- `test/repo/ci-release.test.js`: el paso que decide, con un `npm` falso que contesta como el real (la versión, un E404
  o un ECONNREFUSED). Y el paso que publica, en cuatro desenlaces: publica y no pregunta nada más; con el rechazo y la
  versión a la vista sale en 0 sin volver a publicar; una puerta en rojo sale con su código sin preguntar; y con el
  rechazo y la versión que no aparece, frena después de volver a preguntar. Las dos pruebas nuevas, en rojo antes del
  arreglo.
- Cinco mutaciones en una copia fuera del árbol, las cinco en rojo: cualquier falla de `npm view` como «no está», seguir
  sin mirar el rechazo, el rechazo en rojo como antes, seguir sin confirmar contra el registro y no volver a preguntar.
- Los dos pasos tal como los extrae la prueba, corridos con el `npm` real contra el registro real. Sólo `npm publish`
  era falso y contestaba con el rechazo que se vio en la corrida `39637439349`. `Decide …` dio `published=true` para
  0.113.0, `published=false` para 9.9.9, y con el registro inalcanzable salió en 1 con «No se pudo preguntarle a npm».
  `Publish to npm` sobre 0.113.0 terminó en 0 con «0.113.0 ya estaba en npm: lo publicó una corrida anterior, sigue la
  release».
- La demora del registro se volvió a medir con la release de la 0.113.1, que todavía corrió con el workflow anterior.
  La release de GitHub quedó creada a las 17:39:10Z, `npm view @ingeniomaps/cauce version` siguió devolviendo `0.113.0`
  y npm fecha la versión a las 17:41:19Z. Es el mismo intervalo que el caso describe.
- La release de la 0.113.2 es la primera corrida del workflow nuevo en GitHub. El camino del reintento dentro del
  intervalo sólo se ejerce si algo vuelve a fallar después del publish.
