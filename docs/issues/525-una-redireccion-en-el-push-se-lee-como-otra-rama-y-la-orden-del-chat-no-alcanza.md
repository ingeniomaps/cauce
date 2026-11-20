---
caso: 525
titulo: una redirección en el push se lee como otra rama, y la orden del chat no alcanza
estado: resuelto
resuelto-en: 0.123.1
prioridad: alta
version-detectada: 0.123.0
---

# 525 — una redirección en el push se lee como otra rama, y la orden del chat no alcanza

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **alta**: no deja pasar nada indebido, pero en una sesión real la orden
de push por chat casi nunca funciona. Los agentes agregan `2>&1` al push, y con eso la orden de la persona no alcanza y el
bloqueo ofrece pegar una línea que no tiene sentido (`push origin 2> @ …`).

## Resumen

El guard de push saca los destinos del comando sin quitar las redirecciones. En `git push origin feat/x 2>&1`, el `&`
corta el tramo y lo que queda, `origin feat/x 2>`, se lee como el remoto y dos ramas: `feat/x` y `2>`. La orden «subí
feat/x a origin» autoriza `push origin feat/x` y no `push origin 2>`, así que el push frena. Pasa con cualquier
redirección: `2>&1`, `> log`, `2>/dev/null`.

## Reproducción

Desde la raíz de Cauce, por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), sobre un banco propio
con `runner.allowPush: false`, una sesión por mensaje (script en la sesión que lo midió, `real-525.sh`):

```bash
# para cada comando: el mensaje «subí feat/x a origin» y después el PreToolUse con el comando
git push origin feat/x
git push origin feat/x 2>&1
git push -u origin feat/x 2>&1; echo "exit=$?"
git push origin feat/x > /tmp/x.log
git push origin feat/x 2>/dev/null
```

## Síntoma

Igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
pasa   «subí feat/x a origin» → git push origin feat/x
frena  «subí feat/x a origin» → git push origin feat/x 2>&1
frena  «subí feat/x a origin» → git push -u origin feat/x 2>&1; echo "exit=$?"
frena  «subí feat/x a origin» → git push origin feat/x > /tmp/x.log
frena  «subí feat/x a origin» → git push origin feat/x 2>/dev/null
```

En una sesión real de Claude Code 2.1.329 (2026-11-20, banco instalado), con el mensaje «mandá feat/x a origin», el
agente corrió `git -C <banco> push -u origin feat/x 2>&1; echo "exit=$?"; …`, el guard lo frenó, y el agente le pidió a la
persona que pegara en `.ops-approval` la línea `push origin 2> @ <banco>`. Con «subí main a origin» y `main` habilitada
en `pushToLiveBranches`, lo mismo: el agente dijo que la línea que ofrecía el bloqueo «tiene una ruta mal formada».

## Causa raíz

`engine/hooks/push.js:32`, `PUSH = /\bgit\s+push\b([^;&|\n]*)/g`, corta el tramo en el primer `&`, `;`, `|` o salto, y
`destinationsOf` (`push.js:73`) lee lo que queda como remoto y refspecs. En `… feat/x 2>&1` el tramo es `origin feat/x 2>`, y
`2>` sale como una rama más: `destinationsOf` toma como posicional toda palabra que no empieza con `-`
(`push.js:78`), y ninguno de los dos quita una redirección.

## Fix propuesto

Que `destinationsOf` descarte las redirecciones (`N>`, `N>&M`, `>`, `>>`, `<` y su destino) antes de leer remoto y
ramas, y que la línea que ofrece el bloqueo no pueda traer una. Prueba: «subí feat/x a origin» pasa
`git push origin feat/x 2>&1` y `git push origin feat/x > log`; roja hoy.

## Tradeoffs

- Una redirección al final no cambia qué se publica, así que quitarla del ítem no abre nada. Una redirección que el
  shell expande (`> $X`) tampoco cambia el destino del push.
- Hay que mirar si la misma lectura sirve a otros guards que leen el push (la rama viva, el rastro de `trail`).

## Contexto de descubrimiento

Prueba real de la tanda 519-524, 2026-11-20: la primera tanda de sesiones dejó al agente armar su propio push, y lo hizo
con `2>&1`. El arnés de las pruebas nunca agrega redirecciones, por eso no lo había visto.

## Relacionados

- **103** — la orden de push por chat.
- **522** — la orden de push sin verbo, que esta lectura deja sin efecto en sesiones reales.

## Cierre

**El 526 cambió parte de esto antes de publicarse.** En la misma versión, `PUSH` pasó a leer el tramo con
`SAME_COMMAND` (`engine/hooks/quoting.js`) en vez de su propia alternancia, y hoy está en `push.js:32`; las citas de
abajo son de `b1594b1b`, y las mutaciones del punto 4 corrieron sobre la alternancia de entonces. Y dos cosas que este
cierre deja como pendientes las cerró el 526: un `--force` o un `+rama` detrás de `2>&1` frenan por la regla del force,
y `git 2>&1 push …` se lee como un push. Las dos tablas de abajo dan igual con el código de hoy: el contraste del cierre
las repitió con `1c47404e`.

`PUSH` (`engine/hooks/push.js:33`) ya no corta el tramo en el `&` o el `|` de una redirección (`>&N`, `&>`, `>|`), y
`destinationsOf` (`push.js:77`) saltea cada redirección (`REDIRECT`, `push.js:36`) con su destino, si va en la palabra
siguiente. Las redirecciones se aceptan **sólo al final** del push, que es como las escribe un agente: si detrás de una
aparece otra cosa —una rama, un `--all`, un `--force`, un `+`—, el push queda ilegible y frena entero con un mensaje
propio (`UNREADABLE`), sin salida por el chat ni por `allowPush`: lo que no se leyó puede ser la rama viva. Corregirlo es
del agente, que escribe la redirección al final. Una palabra entre comillas nunca se lee como redirección.

Línea de base: la reproducción de arriba, con el motor de `origin/main`.

Contra el caso:

- **Fix, descartar las redirecciones en `destinationsOf`:** se hizo distinto. Sólo en `destinationsOf` no alcanzaba:
  `PUSH` cortaba en el `&` de `2>&1`, y en `git push 2>&1 origin main` lo que seguía se perdía. La primera versión leyó
  el push entero y saltaba toda redirección donde estuviera, y la revisión independiente midió que entonces el ítem podía
  nombrar una rama distinta de la que se publica: `git push origin feat/x 2>&1 --force` y `… 2>&1 +feat/x` pasaban con
  la orden de `feat/x` (la regla del force no veía la bandera detrás del `&`), `git push origin >& feat/x` publicaba
  `main` con el ítem de `feat/x`, y `… >|log main` también. La segunda versión aceptó las redirecciones sólo al final y
  leyó lo demás como un push sin destino; la segunda pasada midió que ese ítem llevaba la rama actual, así que un
  `main` o un `--all` detrás de la redirección pasaba con `allowPush` o tras un «dale». La versión final frena entero
  lo ilegible, sin salida, y no adivina nada (R27).
- **Fix, que la línea del bloqueo no traiga una redirección:** se hizo; ya no la trae (abajo).
- **Fix, la prueba:** se hizo, más ancha: nueve formas al final que pasan, y ocho que tienen que frenar sin ofrecer la
  línea falsa —la redirección en el medio, un `--force`, un `-f` y un `+` detrás de ella, `>& rama`, `>|log main` y un
  refspec entre comillas que empieza con `>`—.
- **Tradeoff, una redirección no cambia qué se publica:** se cumple; el ítem es el mismo con y sin ella.
- **Tradeoff, otros que leen el push:** `liveMessage`, el rastro de `trail` y la línea de `.ops-approval` salen de los
  mismos destinos, y ahora nombran la rama real; el `--force` y el `--amend` los leen otras reglas de `shell.js`, que no
  usan `PUSH`.

Lo que el caso no preveía: la regla del force-push y la del `--amend` (`shell.js:234` y `:151`) cortan en el mismo `&`,
así que un `--force` o un `--amend` detrás de `2>&1` no lo ven, en `main` y en esta rama; con `allowPush: true` pasan.
Es una regla sin salida y pide otra decisión (qué lee `MISMO`), y sale como caso propio: el **526**. Tampoco se ve una
redirección entre `git` y `push` (`git 2>&1 push …`), como en `main`, y está anotado ahí. Y frenan de más, como en
`main`: una redirección a un archivo con espacios (`> 'a b'`), y `<<<`/`<<`.

### Qué se corrió

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), en un banco propio, una sesión por mensaje
(`main` → después), con «subí feat/x a origin»:

```
pasa  | pasa   git push origin feat/x
frena | pasa   git push origin feat/x 2>&1
frena | pasa   git push -u origin feat/x 2>&1; echo "exit=$?"
frena | pasa   git push origin feat/x > /tmp/x.log
frena | pasa   git push origin feat/x 2>/dev/null
pasa  | pasa   git push origin feat/x &> push.log
frena | frena  git push 2>&1 origin feat/y
frena | frena  git push &> push.log origin main
frena | frena  git push origin feat/x 2>&1 --force
frena | frena  git push origin >& feat/x
frena | frena  git push origin feat/x >|log main
frena | frena  git push origin feat/x '>x:main'
```

Con `allowPush: true` y sin chat (`main` → después):

```
pasa  | pasa   git push origin feat/x 2>&1
frena | frena  git push origin feat/x 2>/dev/null main      (rama viva → ilegible)
frena | frena  git push origin feat/x > log --all          (todas las ramas → ilegible)
pasa  | frena  git push origin feat/x >|log main
pasa  | frena  git push origin feat/x 2>&1 --force
```

Las dos últimas publicaban en `main` sin ninguna aprobación: el arreglo las cierra.

Y la línea que ofrece el bloqueo para pegar (`main` → después): para `git push origin feat/x 2>&1`,
`push origin feat/x` y `push origin 2>` → sólo `push origin feat/x`; con la redirección en el medio, ninguna en las dos.

### Sesión real

El 2026-11-20, dos sesiones de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`, sin los ajustes
de usuario) en un banco instalado desde esta rama, donde el agente armó su propio push. Con «mandá feat/x a origin»
corrió `git push -u origin feat/x 2>&1; echo "exit=$?"; …` y publicó `feat/x` (`f5dded52`); con `main` habilitada y
«subí main a origin», `git push -u origin main 2>&1; …` publicó `dffb758..9014670` (`3974862e`). En la primera tanda,
antes del arreglo, los dos pushes con `2>&1` frenaban. Repetido con la versión final, igual: `git push -u origin feat/x
2>&1; …` publicó `feat/x` (`618ce3fe`) y `git push origin main 2>&1 && …` publicó `e59395f..a7254a8` (`1bcbbb07`).

Mutaciones, en una copia, todas rojas en `test/hooks/push.test.js`: `PUSH` como antes; sin cerrar al final; sin mirar
las comillas; `>&` sin destino; sin `>|`; sin saltear el destino; sin leer redirecciones; sin el bloqueo de lo ilegible; y lo ilegible como antes.

**Sin probar:** nada.

### Lista de cierre

1. hecho: la reproducción con el motor de `origin/main`, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: la prueba del 525, roja antes del arreglo y verde después.
4. hecho: nueve mutaciones sobre la versión final, todas rojas; en la primera, la del `&>` sobrevivía y se sumó su
   caso, y la regla del `>&` con destino se cuida con una fila que pasa (`>& push.log`).
5. hecho: lo que se quita es leer una redirección como rama; la salida de antes y después está arriba, también la línea
   que ofrece el bloqueo.
6. hecho: por la entrada real de los hooks y en sesiones reales, sin el arnés de las pruebas.
7. hecho: dos sesiones reales de Claude Code, arriba.
8. hecho: corrieron las pruebas de `test/hooks`, la entrada real antes y después, con chat y con `allowPush`, la línea
   del bloqueo, y dos sesiones reales, repetidas con la versión final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: `PUSH` y `destinationsOf` los usa sólo `push.js`; los demás que leen el push salen de esos destinos.
11. hecho: tres pasadas independientes. La primera encontró tres formas de que el ítem nombrara otra rama y el diseño
    pasó a aceptar las redirecciones sólo al final; la segunda, que lo ilegible llevaba la rama actual y escapaba de la
    rama viva, y pasó a frenar entero; la tercera, nada que impida entregar.
12. hecho: uno por uno sobre el diff final; ninguno pasa de 0,22 con el tokenizador de la puerta.
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.

