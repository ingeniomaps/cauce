---
caso: 520
titulo: «cerrar» no está entre los verbos que piden algo en el chat, y cerrar un PR no se puede ordenar por ahí
estado: resuelto
resuelto-en: 0.123.1
prioridad: media
version-detectada: 0.123.0
---

# 520 — «cerrar» no está entre los verbos que piden algo en el chat, y cerrar un PR no se puede ordenar por ahí

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **media**: no deja pasar nada indebido, pero la orden explícita de la
persona no destraba el paso. Le pasa al guard de entrega del propio Cauce, no sólo al de una instancia.

## Resumen

Cerrar, reabrir, aprobar o comentar un PR (`gh pr close|reopen|review|comment`) lo frena `destructive` por la regla de
entrega (`delivery.js:70`), y a diferencia del merge su ítem es el comando entero y la orden por chat se lee con
`named`: la frase tiene que **nombrar el comando** y traer un verbo de `ASKS`. Ninguna forma de pedirlo como se pide
pasa —«cerrá el #69 de o/api» frena—; pasa «corré gh pr close 69 --repo o/api». Y `ASKS` no tiene `cerrar` ni `close`,
así que ni nombrando el ítem alcanza con su verbo.

El merge ya salió de ahí en el 280 (`ordersMerge`: el ítem es el PR, y el guard sólo decide la dirección segura). Los
otros cuatro verbos de `gh pr` se quedaron con la lectura vieja.

## Reproducción

Desde la raíz de Cauce, con el arnés de las pruebas y el hook `destructive` real, una sesión de chat nueva por caso
(revisado el 2026-11-19 sobre `27bbf5e5`):

```bash
node -e '
const { chatSession, pushRoot } = require("./test/support/hooks-harness")
const { executeAll } = require("./engine/hooks/run")
const root = pushRoot("cauce-repro-520-")
const out = (i) => { try { executeAll(["destructive"], i); return "pasa" } catch (e) { return e.blocked ? "frena" : String(e) } }
for (const [p, c] of [["cerrá el #69 de o/api", "gh pr close 69 --repo o/api"],
  ["close #69 in o/api", "gh pr close 69 --repo o/api"],
  ["corré gh pr close 69 --repo o/api", "gh pr close 69 --repo o/api"],
  ["mergeá el #69 de o/api", "gh pr merge 69 --repo o/api"]]) {
  const chat = chatSession()
  try { console.log(out({ hook_event_name: "PreToolUse", permission_mode: "dontAsk", cwd: root,
    ...chat.says(p)({ cwd: root, tool_input: { command: c } }) }).padEnd(6), p, "→", c) } finally { chat.close() }
}'
```

Y la lectura de `named` sola, sobre el ítem que arma un guard propio de la instancia donde apareció:

```bash
node -e '
const fs=require("fs"),vm=require("vm"),path=require("path"),{createRequire}=require("module");
const f=path.resolve("engine/hooks/chat.js");
const src=fs.readFileSync(f,"utf8")+"\n;module.exports.__named=named;";
const m={exports:{}}; vm.runInThisContext(require("module").wrap(src))(m.exports,createRequire(f),m,f,path.dirname(f));
const N=m.exports.__named, item="delivery close acme/api pr-69";
for (const t of ["cerrá api pr-69","close api pr-69","autorizo cerrar api pr-69"]) console.log(N(t,item), t)'
```

## Síntoma

```
frena  cerrá el #69 de o/api → gh pr close 69 --repo o/api
frena  close #69 in o/api → gh pr close 69 --repo o/api
pasa   corré gh pr close 69 --repo o/api → gh pr close 69 --repo o/api
pasa   mergeá el #69 de o/api → gh pr merge 69 --repo o/api
```

```
false cerrá api pr-69
false close api pr-69
true  autorizo cerrar api pr-69
```

En la sesión real, un guard de entrega propio de la instancia frenaba `gh pr close` con el ítem
`delivery close <org>/<repo> pr-<n>` y lo pasaba a `APPROVAL.pendingNow` sin `asked`, o sea con `named`. El mensaje
«cerrá api pr-69, api pr-64, bff pr-33, bff pr-31 y bff pr-34» quedó registrado y los cinco cierres se frenaron igual.
Pasó uno sólo cuando la persona escribió «autorizo cerrar …», porque `autorizo` sí está en la lista (el resto, 521).

## Causa raíz

Las citas de esta sección son a 0.123.0 (`27bbf5e5`), donde se detectó; los commits del arreglo movieron algunas líneas.

- `engine/hooks/delivery.js:56-59` (contrastado): `mergeItems` devuelve `null` si algún acto de `gh pr` no es
  `merge`, así que para `close|reopen|review|comment` no hay ítem por PR ni `asked` propio.
- `engine/hooks/shell.js:255-267`: sin `parts`, el ítem es el tramo entero del comando (`stretchOf`, caso 451) y
  `AP.pending` recibe `asked` indefinido, que en `chat.js:415` (`unauthorized`) es `named`.
- `engine/hooks/chat.js:77-88`: `ASKS` no tiene ninguna forma de `cerrar` ni `close`; `asks` (`chat.js:101-104`)
  devuelve `false` sin un verbo de la lista, y `mentions` (`chat.js:122-149`) da `named` sólo con `asked && !denied`.
- El guard de la instancia llegó a `named` por otro camino: usa `engine/hooks/approval.js` por dentro, que según
  `docs/public-api.md` («Lo interno del motor») no es API. Eso lo puede corregir la instancia pasando su propio
  `asked`; no es lo que este caso arregla.

## Fix propuesto

**No** sumar `cerrar`/`close` a `ASKS`. `AGENTS.md` («Un guard no decide con una lista de palabras permitidas») dice
que `ASKS` y `PUSHES` son deuda y no se amplían como salida, y esta es exactamente la forma que esa línea frena: el
próximo verbo que falte se descubre igual, frenando una orden.

Lo que propone esta revisión es extender el modelo del 280 a los cinco actos de `gh pr`: que `mergeItems` arme el
ítem por PR y repositorio para cualquiera de `merge|close|reopen|review|comment` —con el acto en el ítem, para que el
sí a mergear el #12 no cierre el #12— y que `ordersMerge` (renombrado a algo como `ordersPull`) lo lea igual: pasa lo
nombrado por número, nada si pregunta, frena o niega. `review --approve` y `--admin` quedan en el ítem como actos
distintos, igual que hoy `--admin`.

Prueba: en `test/hooks/delivery.test.js`, «cerrá el #69» pasa `gh pr close 69 --repo acme/app`, roja hoy; y «cerrá el
#69» **no** pasa `gh pr close 70`. (Esta revisión decía también «ni `gh pr merge 69`»: no se puede, ver el cierre.)

## Tradeoffs

- **Afloja el guard para cerrar, aprobar y comentar**, que hoy exigen nombrar el comando entero. Con el modelo del
  280, un mensaje que no nombra PRs y no pregunta ni niega —«dale con todos»— pasa cualquiera, y lo que separa una
  orden de una conversación es la lectura del agente. Es lo que el 280 ya decidió para el merge, que es el acto más
  caro de los cinco; pero aprobar un PR (`review --approve`) firma por la persona, y puede querer el borde más alto.
  **Es una decisión de producto que baja a todas las instancias.**
- Alternativa más angosta: el modelo por PR sólo para `close` y `reopen`, que son reversibles, y `review`/`comment`
  siguen como hoy.
- Arreglar esto cierra también, para `gh pr`, el agujero del 523 (el ítem deja de pasar por el basename). No cierra el
  de `gh workflow run` ni `gh release`.

## Contexto de descubrimiento

Una instancia real, 2026-11-17: revisión de los PR de Dependabot. Seis se mergearon y cinco había que cerrarlos con un
comentario. La persona dio la orden tres veces por el chat («cerrá api pr-69, …», luego «autorizo cerrar …»), y al final
pegó las líneas en `.ops-approval`. Costó varias vueltas y no salió nunca por el chat entero.

## Revisión (2026-11-19)

- El caso decía que el defecto era del guard de la instancia; medido, el guard de entrega de Cauce tiene el mismo
  (frena «cerrá el #69 de o/api»), y ahí es donde hay que arreglarlo. La reproducción se rehízo desde la raíz de
  Cauce; la original pedía una instancia instalada.
- El fix propuesto (ampliar `ASKS`) contradice una regla escrita de este repositorio; se reemplazó.
- Citas contrastadas: `chat.js:77-88`, `101-104` y `122-149` coinciden; `chat.js:142-148` era el final de `mentions`
  y está bien. Se agregaron `delivery.js:56-59` y `shell.js:255-267`, que son donde nace el defecto en Cauce.
- Saneado: sin el nombre de la instancia ni de su organización.

## Relacionados

- **280** — sacó la lista de verbos del merge y le dio ítem por PR; este caso es el mismo arreglo para los otros
  cuatro actos de `gh pr`.
- **523** — el ítem de `gh` con `--repo` se autoriza nombrando sólo el repositorio.
- **521** — en una enumeración el verbo vale sólo para el primer elemento; con el fix de acá, los PR enumerados
  pasan por `ordersPull`, que ya lee todos los números del mensaje.
- **109** — origen de exigir un verbo para que nombrar algo cuente como pedido.

## Cierre

Decidido por la persona el 2026-11-19, entre las tres salidas del tradeoff: el modelo del 280 sólo para `close` y
`reopen`, que son reversibles. `mergeItems` (`engine/hooks/delivery.js:46-70` de `15d609f8`) arma un ítem por PR y repositorio para
`merge`, `close` y `reopen`, con el acto adentro, y la lectura que era `ordersMerge` se llama `ordersPull`
(`engine/hooks/orders.js:65` de `15d609f8`) y lee los tres. `review` y `comment` siguen con el comando entero, y un comando que
mezcla uno de ellos también. Un `close` o `reopen` se lee por número sólo si cada palabra es el número, el repositorio o
el comentario con que se cierra (`-c`, que viaja con el cierre como el cuerpo de un merge); cualquier otra vuelve al
comando entero. Así `-d`/`--delete-branch`, que borra la rama local y la remota, frena escrito como se escriba.

Línea de base: la reproducción de arriba y la entrada real de los hooks con el motor de `origin/main` (abajo).

Contra el caso:

- **Fix, no ampliar `ASKS`:** se hizo así; `ASKS` no se tocó.
- **Fix, el modelo del 280 para los actos de `gh pr`:** se hizo, para `close` y `reopen`, por la decisión de arriba.
- **Fix, la prueba:** se hizo, más ancha (cerrar, reabrir, la enumeración, otro número, `menos`, la pregunta, la
  negación, aprobar, comentar y el comando mezclado). Lo que la revisión prometía —que «cerrá el #69» no pasara
  `gh pr merge 69`— se decidió que no: el guard lee números y no verbos, y en `main` esa frase ya pasaba el merge.
  Distinguir el acto pediría una lista de verbos, y `AGENTS.md` no la admite. Por lo mismo, «mergeá el #69» deja cerrar
  el 69; está en el CHANGELOG.
- **Tradeoff, afloja el guard:** se paga para cerrar y reabrir. «dale con todos» los pasa, como al merge.
- **Tradeoff, la alternativa angosta:** es la que se eligió.
- **Tradeoff, el 523:** para `close` y `reopen`, «revisá la api» pasa por diseño, como se había anotado allá. La fila del
  523 que lo medía con `close` pasó a medirlo con `comment`.
- **El guard propio de la instancia:** le toca a la instancia, que usa `approval.js` por dentro (no es API). Con esto ya
  no necesita frenar `gh pr close` por su cuenta: lo frena Cauce, y se ordena por número.

Lo que el caso no preveía: `-c`/`--comment` es una bandera con valor de `close` y `reopen` (`gh pr close --help`, gh
2.86.0), y sin leerla con su valor el texto del comentario se tomaba por el número del PR. Y `-d` borra la rama: la
primera versión lo dejaba pasar con «cerrá el #69»; la segunda lo frenaba con un regex, y la revisión midió que se
escapaba como `--delete-branch=true`, `-dc chau`, dentro de un `bash -c "… -d"` o de un `$(… -d)`. La versión final
no lista lo que se frena: lista lo que deja leer por número (R27). La tercera pasada encontró la última fuga: un `-d`
detrás de un `-c "dup; ver #70"` no se veía, porque `ACTS` corta el tramo en el `;` antes de leer comillas. Ahora un
tramo que termina con una comilla abierta tampoco se lee por número.

Frenan de más, en la dirección segura, y quedan así: un comentario de cierre con `;`, `|`, `&` o un salto de línea, y un
`close` con una redirección (`2>&1`, `> /dev/null`), que se lee como un segundo posicional. Con la línea exacta en
`.ops-approval`, o con el comando entero en el chat, pasan.

El code review del conjunto (2026-11-20) encontró la misma fuga en el merge, desde el 280: `gh pr merge 9 -b "x; y"
--admin` daba el ítem `gh pr merge 9`, y la línea `gh pr merge 9 --repo …` lo aprobaba. La comilla abierta ahora vale
también para el merge (`main` → después: el merge con `-b "listo; va" --admin` pasa → frena; con `-b "listo; va"` sin
`--admin` también frena, que es lo que se paga; con `-b "listo, va"` pasa en los dos). Sigue como en `main` que la orden
por número deje pasar un `--admin` escrito a la vista: la lectura del 280 mira el número, no las banderas.

Y quedan, anotados por la cuarta pasada, tres formas armadas de colar un `-d`: comillas escapadas impares antes de un
separador (`-c "a\";b" -d`), `$'…'` con un `;` adentro, y un `$(…; …)` sin comillas. Ninguna sale escribiendo un
comentario de cierre. Y, como en `main`, `gh pr "close" 69 -d` no lo reconoce ninguna regla.

Quedan como en `main`, anotados por la revisión: lo concedido no se revoca negando el PR por número —«cerrá el #69» y
después «no cierres el #69» deja pasar el cierre, porque `chat.js:188` (de `15d609f8`) revocaba con `mentions`, que no lee números; con el
merge pasaba igual y sale como caso propio, el 524, que en esta misma versión lo resolvió junto con el 527—; un número tras un `|`, `;` o `&` dentro de un valor entrecomillado
se pierde del ítem (`SAME`, `delivery.js:22` de `40936526`), y `-R=<repo>` no se lee como repositorio; los dos frenan. Y una línea de `.ops-approval` escrita con el comando entero y
banderas deja de aprobar, como pasó con el merge en el 280: se escribe en la forma que muestra el bloqueo.

### Qué se corrió

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), una sesión por mensaje; el «antes» con el
motor de `origin/main`:

```
antes frena  | después pasa   «cerrá el #69» → gh pr close 69 --repo o/api
antes frena  | después pasa   «cerrá el #69, el #64 y el #33» → gh pr close 33 --repo o/api
antes frena  | después pasa   «reabrí el #69» → gh pr reopen 69 --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr close 70 --repo o/api
antes pasa   | después pasa   «cerrá el #69» → gh pr merge 69 --repo o/api
antes frena  | después pasa   «mergeá el #69» → gh pr close 69 --repo o/api
antes frena  | después frena  «cerralos todos menos el #69» → gh pr close 69 --repo o/api
antes frena  | después frena  «¿cerramos el #69?» → gh pr close 69 --repo o/api
antes frena  | después frena  «no cierres nada» → gh pr close 69 --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr review 69 --approve --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr comment 69 --body ok --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr close 69 --repo o/api && gh pr comment 69 --body chau --repo o/api
antes pasa   | después pasa   «corré gh pr close 69 --repo o/api» → gh pr close 69 --repo o/api
antes frena  | después pasa   «dale con todos» → gh pr close 69 --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr close 69 -d --repo o/api
antes frena  | después pasa   «cerrá el #69» → gh pr close -c "duplicado" 69 --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr close 69 --delete-branch=true --repo o/api
antes frena  | después frena  «cerrá el #69» → gh pr close 69 -dc chau --repo o/api
antes frena  | después frena  «cerrá el #69» → bash -c "gh pr close 69 --repo o/api -d"
antes frena  | después frena  «cerrá el #69» → gh pr close 69 --repo o/api -c "dup; ver #70" -d
antes frena  | después frena  «cerrá el #69» → gh pr close 69 --repo o/api -c "dup; ver #70"
```

Sin chat, con una línea en `.ops-approval` (`main` → rama): `gh pr close 69 --repo o/api` aprueba ese comando en las
dos, y además el mismo con `-c "duplicado"` en la rama; la línea con `-c "duplicado"` adentro aprueba en `main` y no en
la rama; ninguna aprueba otro repositorio ni el merge.

Mutaciones, en una copia, todas rojas en `test/hooks/delivery.test.js`: `PARTED` sólo con `merge`; `ordersPull` leyendo
sólo `merge`; el ítem siempre `gh pr merge`; `PARTED` con los cinco actos; y de la lectura cerrada, dejarla abierta,
sin `--comment=`, sin `-c`, ignorar el `null` de un acto, leer el cierre como un merge y no mirar la comilla abierta.

### Sesión real

El 2026-11-20, sesiones reales de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`), una por
mensaje, en un banco con Cauce instalado desde esta rama (motor congelado con `git archive`, adaptador de Claude
instalado). Cada sesión corría un comando fijo y el mensaje de la persona era la frase medida. `gh` y `deploy.sh` eran
stubs que anotan lo que corre, y el push iba a un remoto local:

- «cerrá el #69» → `gh pr close 69 --repo o/api` corrió (el stub lo anotó), y `gh pr close 69 -d --repo o/api` frenó
  (`f5138ef3`).

**Sin probar:** nada.

### Lista de cierre

1. hecho: la reproducción y la entrada real con el motor de `origin/main`, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: la prueba del 520, roja con el código anterior y verde con el nuevo.
4. hecho: diez mutaciones en una copia, todas rojas. La de `VALUED` sobrevivía con el número antes de `-c`, y la fila
   se reescribió con `-c` primero.
5. hecho: lo que se quita es la línea de `.ops-approval` con banderas; la salida de antes y después está arriba.
6. hecho: por la entrada real de los hooks, sin el arnés de las pruebas.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: corrieron las pruebas de `test/hooks`, la entrada real antes y después y la línea de `.ops-approval`. Corrió
   una sesión real de Claude Code por mensaje (abajo). La entrada real se repitió el 2026-11-20 con `40936526` y dio lo
   mismo. Los casos 524–528 cambiaron después código que esto atraviesa (`chat.js`, `orders.js`, `delivery.js`,
   `shell.js`): el contraste del cierre repitió la entrada real con `1c47404e` y dio lo mismo, salvo «no cierres el #69»,
   que ahora frena (arriba). Las sesiones reales corrieron sobre `40936526` y no se repitieron; lo que esos casos
   cambiaron lo probaron sus propias sesiones.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: `delivery.js` es el único que usa la lectura; las pruebas del 280 y del 523 que fijaban lo de antes se
    cambiaron a sabiendas, y `ordersMerge` no queda nombrado en ningún lado.
11. hecho: cuatro pasadas independientes sobre el caso, y tres más sobre los arreglos del code review del
    conjunto (2026-11-20), hasta una sin nada que impida entregar. La primera encontró el `-d` que pasaba; la segunda, que el regex que lo
    frenaba se escapaba de cinco formas; la tercera, el `-d` detrás de un comentario con `;`; y cada vez se reescribió. La
    cuarta, nada que impida entregar: lo que señaló son comandos armados, anotados arriba.
12. hecho: uno por uno sobre el diff final; cuatro desfasados se corrigieron (`delivery.js:9-11`, `orders.js:3`,
    `orders.js:50` y el ejemplo de `chat.js:127`), y ninguno pasa de 0,22 con el tokenizador de la puerta.
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.
