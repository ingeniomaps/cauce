---
caso: 540
titulo: un `gh pr create --repo` que nombra el original desde un fork pasa, y R10 dice que el destino se comprueba
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 540 — un `gh pr create --repo` que nombra el original desde un fork pasa, y R10 dice que el destino se comprueba

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: un PR mal apuntado no tiene vuelta atrás (R10: «lo ven, les
llega la notificación, y cerrarlo no deshace nada»). Una instancia real lo frena por su cuenta. Y pasó: el 2026-09-07,
en otro proyecto, se abrieron tres PR contra el original saltándose el fork, por suposición.

## Resumen

`delivery` frena `gh pr create` sin `--repo`, porque en un fork `gh` resuelve el destino al original
(`engine/hooks/delivery.js:95-100`). Con `--repo` puesto no frena nada, sea cual sea el repositorio que nombra. El
comentario de esa regla dice «Con el destino nombrado no se frena (R10: a dónde se publica se decide y se comprueba)».
Decidirlo se cumple: el agente lo escribe. Comprobarlo no lo hace nadie.

R10 (`template/planning/rules/system/commits.md`) dice qué hay que comprobar: «lo que se publica va al repositorio en
el que se está trabajando. Si ese remoto es un fork, va al fork». Un `--repo org/app` desde un checkout cuyo `origin` es
`me/app` es justo lo que R10 prohíbe sin pedido explícito, y pasa.

## Reproducción

Sin modelo. Un repositorio con `origin` en `me/app` y `upstream` en `org/app`, y `execute('destructive', …)` del arnés
de guards:

```
PASA  gh pr create --repo org/app --base develop --fill
PASA  gh pr create --repo me/app --base develop --fill
FRENA gh pr comment 5 --repo org/app --body x
```

La primera tendría que frenar y no frena. La segunda es la correcta y tiene que seguir pasando. La tercera es el
control: comentar frena siempre, con o sin destino.

## Síntoma

El freno de hoy enseña a escribir `--repo`, y no dice cuál. Un agente que lo corrige con el repositorio que tiene a
la vista —el `upstream`, el que nombra el README, el de un PR anterior— abre el PR en el repositorio de otro equipo,
con el freno satisfecho. Es la forma del 2026-09-07: el destino se dedujo del contexto, que R10 dice que no es una
autorización.

## Causa raíz

El 225 cerró la forma («sin destino») y dejó el contenido («qué destino») a la persona, sin decirlo en la regla. El
comentario de `delivery.js:96-97` cita el «se comprueba» de R10 como si el `--repo` lo cumpliera.

## Fix propuesto

Para `gh pr create --repo <dueño>/<nombre>`, comparar el repositorio nombrado con el `origin` del checkout donde corre
`gh`:

- Si coinciden, pasa como hoy.
- Si no coinciden, frena con un ítem `gh pr create --repo <dueño>/<nombre>`. Se aprueba como el resto: por el diálogo,
  con una orden en el chat que nombre ese repositorio o con la línea en `.ops-approval`. Ahí entran los PR que una
  instancia autoriza de antemano en sus reglas.
- Sin `origin`, o con un `origin` que no es de GitHub, frena: sin eso no hay contra qué comprobar, y frenar es la
  dirección segura.

El checkout es el `cwd` de la llamada, o el que nombra un `cd <dir> &&` al principio del comando, que es donde `gh`
resuelve. El motor no lee hoy el `origin` en ningún guard (`grep -rn get-url engine` sólo encuentra la lista de
lecturas de `line-scope.js:185`), así que esto es código nuevo: `git -C <dir> remote get-url origin`.

## Tradeoffs

- **Equipo sin fork:** si el `origin` es el repositorio de la organización, `--repo org/app` coincide y pasa. No cambia
  nada para quien trabaja directo en el original.
- **Un PR a otro repositorio propio** (`--repo me/otro` desde `me/app`) frena. Es poco común, y la salida es aprobarlo.
  Comparar sólo el dueño lo dejaría pasar, pero también dejaría pasar un fork en la organización; se compara el
  repositorio entero.
- **Sidecar:** el agente suele estar en la instancia y el PR es del producto. Si corre `gh pr create --repo` desde la
  instancia, el `origin` es el de la instancia y frena. Es lo seguro, aunque `gh` no resuelve desde ahí un `--repo` nombrado (ver el cierre), y hay que
  medir que el mensaje diga desde dónde comparó, para que la salida sea correr desde el producto y no aprobar a ciegas.
- **La URL del `origin` puede traer una credencial** (caso 530). El guard la usa para comparar y no la imprime: el
  mensaje nombra sólo `<dueño>/<nombre>`.
- **Es un freno nuevo sobre algo que hoy pasa.** No es una quita, así que no pide comparar antes y después, pero baja a
  todas las instancias con `delivery`. La aserción es que `--repo` igual al `origin` siga pasando.

## Contexto de descubrimiento

Paso 3 de la auditoría de una instancia (2026-11-21), ítem 9 del nivel 2: «`--repo` apuntado al upstream comparando
contra la cuenta del `origin`». El guard de entrega de la instancia lo hace leyendo `git remote get-url origin` y
compara la cuenta. Su encabezado dice por qué: el fork es el de cada persona, y no puede escribirse uno para todos. La
otra instancia que construyó su propio guard de entrega sólo exige `--repo`, igual que Cauce hoy.

## Relacionados

- 225: `delivery` y el freno de `gh pr create` sin `--repo`.
- 446: dónde vale una aprobación de `gh`.
- 530: la credencial en la URL de un remoto, que esta lectura no tiene que imprimir.
- 539: el mismo guard, otro defecto (las formas por la API).

## Cierre

Se recorrió el caso entero:

- **Fix propuesto: comparar el `--repo` con el `origin` del checkout** — se hizo, en `destination` de
  `engine/hooks/delivery.js`. Cada viñeta:
  - si coinciden pasa, y si no, frena con el ítem `gh pr create --repo <destino>`: hecho. La comparación es por
    dueño y nombre, en minúsculas, y acepta el destino con el host o con la URL entera. Se hizo distinto en un punto:
    no se mira el host. Así un `origin` de GitHub Enterprise se compara igual, que con un host fijo en `github.com`
    frenaba todo.
  - se aprueba como el resto: hecho, por el diálogo, por una orden en el chat que nombre el comando o con la línea en
    `.ops-approval`, que vale para ese destino.
  - sin `origin`, frena: hecho, y también frena el destino que no se puede leer (`--repo "$UP"`, `$(…)`), con o sin
    `origin`.
  - el checkout es el `cwd` o el del `cd <dir> &&` del principio: hecho, con `gitDirectory`. El motor no leía el
    `origin` en ningún guard, así que `originOf` es código nuevo y sólo corre si el comando trae `pr create`.
- **Tradeoffs: equipo sin fork** — hecho: con el `origin` en la organización, `--repo org/app` coincide y pasa.
- **Tradeoffs: un PR a otro repositorio propio** — hecho, frena, y se compara el repositorio entero.
- **Tradeoffs: sidecar** — se hizo distinto, porque el caso afirmaba algo falso. Con `--repo` nombrado, `gh` no resuelve
  el destino desde la carpeta, así que «`gh` también resolvería desde ahí» no era cierto. Desde la instancia sin `cd`,
  el freno salta porque el `origin` de la instancia no es el destino, y el mensaje dice desde qué carpeta comparó y cuál
  es su `origin`. La salida es correr desde el producto. Es un freno de más, hacia el lado seguro.
- **Tradeoffs: la credencial en la URL** — hecho: el mensaje nombra sólo `dueño/nombre` y la carpeta, y la prueba con
  `s3cr3t` en la URL lo afirma.
- **Tradeoffs: un freno nuevo para todas las instancias** — hecho, con su aserción: `--repo` igual al `origin` pasa. La
  prueba de `delivery.test.js` que daba por buena `gh pr create --repo acme/app` en una carpeta sin git ahora le da un
  `origin` `acme/app`.
- **Lo que el enunciado no preveía:**
  - `gh` usa el último `--repo` si se repite, y el `-R` puede ir antes del subcomando o pegado (`-Racme/app`). Las dos
    cosas se verificaron con gh 2.86.0, y gana el último.
  - `gh pr new` es el alias de `pr create`, y no lo miraba ninguna regla, ni la de sin `--repo`. Ahora lo miran las dos.
  - Abrir el PR por la API nombra el destino en la ruta y no hay checkout contra el cual compararlo: frena siempre
    (caso 539).
  - R10 dice ahora «abrirlo sin nombrar el destino o en uno que no es el `origin`».

Lo que se corrió:

- Línea de base, en «Reproducción»: `--repo org/app` desde un fork pasaba.
- `test/hooks/pr-destination.test.js`, 4 pruebas, las cuatro en rojo contra el `delivery.js` de HEAD y en verde después:
  - remotos por SSH, HTTPS, `ssh://…:443`, con credencial y de GitHub Enterprise;
  - `cd`, sin `origin`, remoto local, destino ilegible, `-R` repetido o pegado, alias `pr new`;
  - la aprobación por el chat y por `.ops-approval`.
- 15 mutaciones en una copia, las 15 rojas y la copia sin mutar verde. De las que sobrevivieron en el camino, tres
  pidieron su caso: `--repo=`, el destino entre comillas y `pr new` sin `--repo`. Otras tres mostraron que quitar el
  esquema, la credencial y el puerto de la URL sobraba, porque se toman los dos últimos tramos, y se quitó.
- Banco sin modelo con el runner de Claude instalado, repetido sobre la versión final: desde un checkout con el fork
  como `origin`, `--repo` al original dio exit 2, y al fork, exit 0.
- Sesión real de `claude -p` 2.1.330 (sesión `5f39cb36`, USD 0,33), con un subagente que tenía que abrir el PR mientras el
  pedido mencionaba la organización. No llegó a ejercer el freno: la sesión preguntó antes de lanzar el subagente. Por
  dos razones. Las instrucciones globales de quien corre el banco ya dicen que el PR va al fork, y se cargan también en
  la sesión del banco. Y el banco estaba mal armado para ese pedido: nombraba `../app`, que no existe (el producto está
  en `./app`), y el producto no tiene rama `develop`.
- `npm run ci` con los archivos nuevos stageados: 1883 de 1883, exit 0.

**Lo que se cerró después** (2026-11-22, a pedido de Manuel):

- **El freno en una sesión real.** Corrí `claude -p` 2.1.330 sin las instrucciones del usuario
  (`--setting-sources project,local`), en un banco con un `gh` falso. El subagente corrió
  `gh pr create --repo acme-org/app --base main --head fork-dev:feat/sumar …` desde `./app`. `guard-shell.sh` lo frenó
  con «'gh pr create' abre el PR en un repositorio que no es el origin del checkout», el `gh` falso no llegó a correr y
  el subagente no intentó esquivarlo. USD 0,89.
- **El PR desde una subcapa**, `(cd app && gh pr create …)`, frenaba de más: resolvía la carpeta de la sesión, sin
  `origin`. El primer arreglo sumó `(` al `cd` de `gitDirectory`, y la revisión halló que eso abría un hueco en `git-add`:
  `(cd $OTRO && ls); git add -A` dejaba de frenar, porque el `cd` de una subcapa ya cerrada no mueve al comando de
  después. Se revirtió, y la subcapa se resuelve sólo para el PR (`prDirectory` en `delivery.js`): cuenta el `cd` de la
  subcapa que contiene al `gh pr create`. `git-add.test.js` suma la prueba del hueco, y la mutación que repone el
  cambio global la pone roja. Los paréntesis se buscan con las comillas tapadas, vale un espacio después del
  paréntesis (`( cd app && … )`), y el `)` que cierra la subcapa ya no queda pegado al valor de `--repo`.
- **Cada `gh pr create` resuelve su carpeta** (`dirAt`): los `cd` en orden, de afuera hacia la subcapa que lo contiene,
  con paréntesis balanceados, sobre la carpeta del comando. Las subcapas que cerraron y los `cd` entre comillas no
  cuentan, salvo en el argumento de un `bash -c`, que es otra subcapa: su `cd` mueve a lo de adentro y no al shell de
  afuera. Un `git -C`, un `cd` en segundo plano (`cd x &`, también con una redirección en el medio; `&>` es una
  redirección y sí mueve) o uno de cualquier lado de una tubería ya no mueven la carpeta. HEAD los tomaba como la del
  shell, y dejaba pasar `git -C ../otro status && gh pr create --repo <original>`.
- **Las revisiones de esta vuelta hallaron cuatro retrocesos de las versiones intermedias:** usar una sola carpeta para
  todas las llamadas, tomar un `$(…)` cerrado como la subcapa, emparejar por posición con lo citado, y aplicar al shell
  de afuera el `cd` de un `bash -c`. Los cuatro se arreglaron con su prueba. La última pasada, contra HEAD y contra
  bash real sobre 207 entradas, no halló nada que impida entregar; de lo que encontró se arreglaron las redirecciones
  junto al `&` y el `|` y el `cd` tras una tubería, con su prueba y su mutación, sin otra pasada. 25 mutaciones, las 25
  rojas, junto con las del 539, con la copia sin mutar en verde.

**Sin probar:** `cd -- app`, `cd $PWD/app`, `pushd app` y una ruta con espacios entre comillas, que frenan de más como en HEAD; una
función que hace `cd` (`f() { cd ../otro; }; f; gh pr create`), cuyo `cd` se cuenta aunque la función no se llame; y
`builtin cd`, `command cd`, `\cd` o `CDPATH= cd`, que el guard no ve: hace falta un comando armado a propósito.

### Lista de cierre

1. hecho: la reproducción de «Reproducción», con su control.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las cuatro pruebas en rojo contra HEAD y en verde después.
4. hecho: 15 mutaciones en una copia, las 15 rojas. De las que sobrevivieron en el camino, tres (`--repo=`, las comillas y `pr new` sin `--repo`) sumaron su caso, y otras tres (el esquema, la credencial y el puerto) se contestaron quitando lo que sobraba. Dos que no cambiaban nada se reescribieron contra el texto real.
5. no aplica: agrega un freno y no quita ni reemplaza nada; la regla de sin `--repo` sigue igual, más su alias.
6. hecho: banco sin modelo por el hook instalado del runner, sin dobles en el motor; se midió que `--repo` al original ya no pasa y que al fork sigue pasando.
7. hecho: Manuel decidió el 2026-11-22 que el 540 se prueba con el banco sin modelo; además, el 2026-11-22 una sesión real sin las instrucciones del usuario ejerció el freno en un subagente.
8. hecho: «Lo que se corrió» enumera los caminos; las mutaciones, la sesión y el banco sin modelo, repetido al cerrar, corrieron sobre la versión final.
9. hecho: dos checkouts con historia distinta (fork y sin fork), dos posiciones del `-R` y dos `--repo` en un mismo comando.
10. hecho: dependía `delivery.test.js`, que daba `--repo` por bueno sin git, y el comentario de `delivery.js` que decía «con el destino nombrado no se frena», corregido.
11. hecho: tres pasadas de revisión independiente sobre el caso, más las pasadas de revisión independiente; en la vuelta de cierre del 2026-11-22 una halló que el `cd` de una subcapa abría un hueco en `git-add`, se revirtió y se volvió a revisar.
12. hecho: pasada de comentarios; se corrigió el comentario que el propio caso señalaba como causa raíz.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1883 de 1883, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que el enunciado no preveía.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0 («Corregido»).
