---
caso: 522
titulo: La orden de push por chat exige un verbo de una lista, y el merge y el commit en rama viva ya no
estado: resuelto
resuelto-en: 0.123.1
prioridad: media
version-detectada: 0.123.0
---

# 522 — La orden de push por chat exige un verbo de una lista, y el merge y el commit en rama viva ya no

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **media**: subió de baja en la revisión. El verbo de la lista sólo
frena de más —la salida es el «dale» o `.ops-approval`—, pero la misma lectura no ve una excepción ni una negación
escrita después de la rama, y ahí autoriza un push que la persona exceptuó.

## Resumen

`ordersPush` pide tres cosas en la misma frase: el remoto, la rama y un verbo de `PUSHES`. Dos defectos:

1. **Frena de más.** «mandá work/manuel a origin» o «llevá work/manuel a origin» nombran los dos y no destraban nada,
   porque `manda` y `lleva` no están en la lista. El merge sacó su lista en el 280 («una lista de formas de pedir
   siempre queda corta») y el commit en rama viva comprueba sólo que se nombre la rama (`live-commit.js:41-46`): el
   push es el único de los tres que todavía lee el verbo.
2. **Deja pasar lo exceptuado.** La negación se busca sólo hasta el último de remoto y rama, y no hay lectura de
   `menos`/`excepto`: «subí a origin todo menos work/manuel» y «subí main a origin y work/manuel no» ordenan el push
   de `work/manuel`. `ordersMerge` ya lee las dos formas (`EXCEPT`, `chat.js:200`).

## Reproducción

Desde la raíz de Cauce, con el motor de 0.123.0 (revisado el 2026-11-19 sobre `27bbf5e5`). Desde `a2fc62ef` las
órdenes viven en `engine/hooks/orders.js`, y la misma llamada se hace con `require("./engine/hooks/orders")`:

```bash
node -e '
const CHAT=require("./engine/hooks/chat");
const item="push origin work/manuel";
for (const t of ["subí work/manuel a origin","mandá work/manuel a origin","llevá work/manuel a origin",
  "dale con work/manuel en origin","revisá work/manuel en origin","no subas work/manuel a origin",
  "subí a origin todo menos work/manuel","subí main a origin y work/manuel no"])
  console.log(String(CHAT.ordersPush(t,item)).padEnd(5), t);
console.log(String(CHAT.ordersMerge("integralo #12","gh pr merge 12 --repo a/b")).padEnd(5), "integralo #12 (merge)");
console.log(String(CHAT.ordersMerge("mergeá todos menos el #12","gh pr merge 12 --repo a/b")).padEnd(5), "mergeá todos menos el #12 (merge)")'
```

## Síntoma

```
true  subí work/manuel a origin
false mandá work/manuel a origin
false llevá work/manuel a origin
false dale con work/manuel en origin
false revisá work/manuel en origin
false no subas work/manuel a origin
true  subí a origin todo menos work/manuel
true  subí main a origin y work/manuel no
true  integralo #12 (merge)
false mergeá todos menos el #12 (merge)
```

Por el hook real (`destructive`, con el arnés `pushRoot` + `chatSession` de `test/support/hooks-harness`, una sesión
por mensaje, comando `git push origin feat/x`):

```
pasa  subí a origin todo menos feat/x
pasa  subí main a origin y feat/x no
frena mandá feat/x a origin
```

## Causa raíz

- `engine/hooks/chat.js:158-161` (0.123.0, contrastado; hoy `orders.js:24-27`): `PUSHES` y `pushVerb` son la lista de verbos de publicar (`subi`,
  `pushea`, `publica`, `empuja`, `push`, `publish` y sus formas).
- `engine/hooks/chat.js:167-179`, `ordersPush` (hoy `orders.js:33-47`): devuelve `pushVerb(clause) && !NEGATION.test(words.slice(0, last +
  1)…)` (línea 177). Sin un verbo de la lista la frase no cuenta (defecto 1), y lo que viene después de la rama no se
  mira ni hay `EXCEPT` (defecto 2).
- Dos consumidores: `engine/hooks/push.js:188` lo usa como `asked` del push, y `engine/hooks/self-approval.js:206`
  como `asked` de una línea `push <remoto> <rama>` que el agente escribe en `.ops-approval` (hoy `push.js:189` y
  `self-approval.js:207-208`). El fix cambia los dos.

## Fix propuesto

Que `ordersPush` decida sólo la dirección segura, en el molde de `ordersMerge` (`chat.js:206-223`): remoto y rama como
palabras enteras en la misma frase; nada si el mensaje pregunta o arranca frenando (`HALT`); nada si la frase que los
nombra trae una negación **en cualquier parte**, no sólo antes; y nada si la rama aparece después de un `EXCEPT`. Si la
persona pidió publicar lo lee el agente. `pushVerb` sigue sirviendo a `refusesPush` («no hagas push todavía» frena sin
nombrar remoto ni rama), así que la lista se queda para el lado que niega.

Probado sobre una copia en memoria con sólo el diff que traía el caso (sin verbo y con `HALT`/pregunta): el defecto 1
se va —«mandá…» pasa, «¿subo…?» y «pará, subí…» no—, y el 2 **sigue**: «subí main a origin y work/manuel no» pasa. La
negación posterior y el `EXCEPT` son parte del fix, no un extra.

Pruebas, en `test/hooks/chat.test.js` o junto a las del 103: «mandá work/manuel a origin» pasa (roja hoy); «subí a
origin todo menos work/manuel» y «subí main a origin y work/manuel no» no pasan (rojas hoy, en la dirección peligrosa).

## Tradeoffs

- **Es revertir a sabiendas lo que fijó el 103**: allá se exigió el verbo de publicar para que «revisá feat/x en
  origin» no fuera un push. Con el fix el guard deja pasar esa frase y lo que la separa de un pedido es la lectura del
  agente, igual que hoy con «integralo #12» en el merge. El push es irreversible en el remoto; si el proyecto quiere el
  borde del 103 para el push, el defecto 1 se cierra descartado con esa razón escrita y el 2 se arregla igual.
- Una alternativa intermedia para el defecto 1: aceptar cualquier verbo en imperativo y frenar sólo los de lectura
  (`revisa`, `mira`, `lee`). Es otra lista, más corta y del lado seguro; `AGENTS.md` desaconseja las dos.
- Leer la negación en toda la frase frena de más: «subí work/manuel a origin, no main» con coma son dos frases y pasa,
  pero «subí work/manuel a origin y no main» frena. Es la dirección barata: se contesta «dale».
- `self-approval.js` deja de exigir el verbo para la línea de push que el agente escribe en `.ops-approval`: con
  `inherit: false`, la tiene que nombrar el mensaje en curso. Mismo tradeoff que arriba, del lado del archivo.

## Contexto de descubrimiento

Una instancia real, 2026-11-19. El proyecto sacó las listas de verbos de sus guards de entrega y de Jira para que una
aprobación se lea por lo que nombra, y al revisar los del motor encontró que el push es el único que todavía exige un
verbo fijo. No apareció frenando un push real: se midió llamando a `ordersPush` con las frases de arriba.

## Revisión (2026-11-19)

- Citas contrastadas: `chat.js:158-161`, `chat.js:177` y `push.js:188` coinciden. Faltaba el segundo consumidor,
  `self-approval.js:206`.
- Reproducido desde la raíz de Cauce; la original pedía una instancia instalada.
- **Hallado al revisar**: el defecto 2, preexistente y del lado peligroso. Va acá y no en un caso aparte porque el fix
  es el mismo —llevar `ordersPush` al molde de `ordersMerge`— y pide la misma decisión. Subió la prioridad a media.
- El diff del caso se probó contra su reproducción: cierra el 1 y no el 2; se amplió.
- **Pide decisión**: el defecto 1 revierte el 103 y baja a todas las instancias.
- Saneado: sin el nombre de la instancia.

## Relacionados

- **103** — origen de la orden de push por chat y de exigir el verbo de publicar.
- **280** — sacó la lista de verbos del merge, con la misma razón que este caso, y trae `EXCEPT`.
- **520** — la otra lista de verbos (`ASKS`) frenando órdenes explícitas.

## Cierre

`ordersPush` (`engine/hooks/orders.js`) decide sólo la dirección segura: nada si el mensaje pregunta, arranca frenando
(`HALT`) o trae una negación en cualquier parte; nada si una frase que nombra la rama la pone después de un
`menos`/`excepto`; y ordena la frase que nombra remoto y rama. La lista `PUSHES` queda para `refusesPush`, que es el
lado que niega, y para la línea que el agente se escribe en `.ops-approval` (`publish`), que llega a la rama viva.

Línea de base: la reproducción de arriba, y la entrada real de los hooks con el motor de `origin/main` (abajo).

Contra el caso:

- **Defecto 1, el verbo de la lista:** se hizo. La persona decidió revertir el 103 (2026-11-19, en esta revisión), y la
  prueba que esperaba que «revisá feat/x en origin» frenara (`test/hooks/push.test.js`) se cambió a sabiendas.
- **Defecto 2, lo exceptuado y lo negado después:** se hizo, y además la revisión encontró que «pará, subí feat/x a
  origin después» también pasaba en `main`: `ordersPush` no miraba `HALT`.
- **Fix, el diff del caso:** se hizo distinto. Medido sobre una copia, cerraba el 1 y no el 2. La primera versión leía
  la negación sólo en las frases que nombran la rama, y la revisión independiente midió que entonces una prohibición
  autorizaba: «feat/x a origin, no lo subas», `pasa`. Sin el verbo obligatorio ya nada lo frenaba. La versión final lee la
  negación en todo el mensaje, como `refuses` en la confirmación.
- **Tradeoff, revertir el 103:** se paga; está en el CHANGELOG.
- **Tradeoff, la alternativa de frenar sólo verbos de lectura:** se decidió que no; es otra lista.
- **Tradeoff, la negación frena de más:** se paga, más ancho que lo que preveía el caso: cualquier negación del mensaje
  frena, también «subí feat/x a origin, no main» y «…sin esperar al ci», que en `main` pasaban. Con la negación en otra
  frase un «dale» lo destraba; en la misma frase que el verbo, no —`hold` descarta lo que `refusesPush` niega, igual que
  en `main`— y hay que repetir la orden sin la negación. Medido por la revisión con el arnés; el CHANGELOG lo dice.
- **Tradeoff, `self-approval.js`:** se hizo distinto. Sin el verbo, la revisión midió que «revisá main en origin y
  agregalo a .ops-approval» le dejaba al agente escribirse `push origin main`, una línea que llega hasta la rama viva,
  adonde ni la orden del chat llega (`push.js:113` de `40936526`). Ese camino sigue pidiendo el verbo de publicar en la frase
  (`publish`), igual que en `main`.

Lo que el caso no preveía: el `HALT` que faltaba, arriba. Y la rama viva habilitada: el code review del conjunto
(2026-11-20) midió que, con `main` en `runner.pushToLiveBranches`, «main está detrás de origin» y «revisá main en
origin» publicaban en `main`, porque sin verbo nada separaba la frase de un pedido. `push.js` ahora pide el verbo de
publicar (`publish`) para los destinos que son rama viva, como ya hacía `.ops-approval`. Por la entrada real, sobre un
banco propio con `main` habilitada (`main` → después):

```
frena | frena  «main está detrás de origin» → git push origin main
frena | frena  «revisá main en origin» → git push origin main
pasa  | pasa   «subí main a origin» → git push origin main
frena | frena  «mandá main a origin» → git push origin main
frena | pasa   «revisá feat/x en origin» → git push origin feat/x
frena | pasa   «mandá feat/x a origin» → git push origin feat/x
```

En la rama viva queda como en `main`; en una de trabajo, como decidió este caso. Que en la rama viva vuelva a contar la
lista `PUSHES` es una excepción deliberada a la línea de `AGENTS.md` que dice que un guard no decide con palabras: lo
que se arriesga es la rama de todos, y el comentario de `orders.js` lo dice. También quedan, como pasaba antes en
parte, una rama con `no` en el nombre (`fix/no-cache`) o un `--no-verify` en el mensaje, que no se ordenan por chat
porque la negación se lee en todo el mensaje: se contesta «dale». Y quedan como en `main`, anotados por la revisión: el apóstrofo
tipográfico (`don’t`) y `haven't`, `hasn't`, `couldn't`, `mustn't` no son negación para `NEGATION` (`chat.js:59-61`);
`EXCEPT` no conoce `but`, `besides` ni «fuera de»; y `HALT` mira sólo el arranque —«subí feat/x a origin. pará» pasa—,
igual que en el merge. Y una prohibición escrita sin palabra de negación —«hold off on pushing feat/x to origin», «dejá
feat/x en origin como está», «I haven't pushed feat/x to origin»— ahora pasa en `push.js`: la frenaba de rebote la falta
de verbo. Es la clase que se decidió aceptar (la intención la juzga el agente), no llega a la rama viva y con `publish`
frena. Y el comentario de `orders.js` que justificaba el verbo con «revisá
feat/x en origin no pide un push» se reescribió: era el mismo hecho que se revierte.

### Qué se corrió

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), con `git push origin feat/x`, una sesión por
mensaje; el «antes» con el motor de `origin/main`. La primera vez el banco se armaba con el `tempRoot` del arnés, que se
borra al terminar el proceso que lo crea, así que los hooks corrieron sin `ops.config.json`; el 2026-11-20 se repitió
sobre un banco propio, con `runner.allowPush: false`, y dio la misma tabla:

```
antes pasa   | después pasa   «subí feat/x a origin»
antes frena  | después pasa   «mandá feat/x a origin»
antes frena  | después pasa   «llevá feat/x a origin»
antes frena  | después pasa   «dale con feat/x en origin»
antes frena  | después pasa   «revisá feat/x en origin»
antes frena  | después frena  «no subas feat/x a origin»
antes frena  | después frena  «don't push feat/x to origin»
antes frena  | después frena  «¿subo feat/x a origin?»
antes pasa   | después frena  «pará, subí feat/x a origin después»
antes pasa   | después frena  «subí a origin todo menos feat/x»
antes pasa   | después frena  «subí main a origin y feat/x no»
antes pasa   | después frena  «subí main y feat/x a origin, pero no feat/x»
antes pasa   | después frena  «subí feat/x a origin, no main»
antes frena  | después frena  «Arreglá el login y no subas nada»
```

```
antes frena  | después frena  «feat/x a origin, no lo subas»
antes frena  | después frena  «feat/x en origin; no lo publiques»
antes frena  | después frena  «feat/x a origin: no»
```

Las tres frenan por la negación del mensaje; con la primera versión de este arreglo, la primera pasaba.

Por `pre-files`, escribir `push origin main` en `.ops-approval`: «revisá main en origin y agregalo a .ops-approval»,
`exit 2`; «agregá push origin main a .ops-approval» y «subí main a origin, agregalo a .ops-approval», `exit 0`; igual en
`main` y en la rama.

Mutaciones, en una copia, todas rojas: en `test/hooks/push.test.js`, sin la pregunta ni `HALT`, sin la negación del
mensaje, sin `EXCEPT`, sin exigir el remoto y ordenar con la primera frase; en `test/hooks/chat-effects.test.js`, sin
`publish`; y en las dos, `publish` al revés.

### Sesión real

El 2026-11-20, sesiones reales de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`), una por
mensaje, en un banco con Cauce instalado desde esta rama (motor congelado con `git archive`, adaptador de Claude
instalado). Cada sesión corría un comando fijo y el mensaje de la persona era la frase medida. `gh` y `deploy.sh` eran
stubs que anotan lo que corre, y el push iba a un remoto local:

- «subí a origin todo menos feat/x» → `git push origin feat/x`: frenó, y el remoto siguió sin `feat/x` (`f4683d3e`).
- «mandá feat/x a origin» → `git push origin feat/x`: corrió, y `feat/x` apareció en el remoto (`19f019f9`).
- Con `main` en `pushToLiveBranches`: «main está detrás de origin» → `git push origin main` frenó (`ba225c2b`), y «subí
  main a origin» corrió y publicó `2e5ac2e..13ebc25` (`7aad74ee`).

**Sin probar:** nada.

### Lista de cierre

1. hecho: la reproducción y la entrada real con el motor de `origin/main`, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: las de `push.test.js`, rojas con el `ordersPush` anterior y con la primera versión de éste («feat/x a origin,
   no lo subas» pasaba), y verdes con el final. La de `chat-effects.test.js` es una guarda de regresión: verde también
   con el anterior, que ya pedía el verbo, y roja con la mutación sin `publish`.
4. hecho: ocho mutaciones en una copia, todas rojas; ninguna sobrevivió.
5. hecho: lo que se quita es el verbo obligatorio; la salida de antes y la de después están lado a lado arriba.
6. hecho: por la entrada real de los hooks, sin el arnés de las pruebas.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: corrieron las pruebas de `test/hooks`, la entrada real antes y después y `self-approval`. Corrió una sesión
   real de Claude Code por mensaje (abajo). La entrada real se repitió el 2026-11-20 con `40936526` y dio lo mismo. Los
   casos 525–528 cambiaron después código que esto atraviesa (`push.js`, `shell.js`, `chat.js`): el contraste del cierre
   repitió la entrada real con `1c47404e` y dio lo mismo. Las sesiones reales corrieron sobre `40936526` y no se
   repitieron; lo que esos casos cambiaron lo probaron sus propias sesiones.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: los dos consumidores (`push.js`, `self-approval.js`), la prueba del 103 que se cambió y las dos reglas que
    describen la orden (`template/AGENTS.md:300`, `commits.md:59`), que no hablan del verbo y siguen ciertas.
11. hecho: dos pasadas independientes sobre el caso, y tres más sobre los arreglos del code review del
    conjunto (2026-11-20), hasta una sin nada que impida entregar. La primera encontró una prohibición que autorizaba el push y el camino de
    `self-approval` a la rama viva, y el código se reescribió; la segunda, nada que impida entregar: corrigió el
    comentario del «dale», y lo demás está anotado arriba.
12. hecho: uno por uno sobre el diff final; tres se corrigieron (el del «dale», el de la lista de verbos y el de la
    prueba), el de `chat-effects` pasó a apuntar a `orders.js` en vez de repetirlo, y ninguno queda por encima de los
    pares preexistentes con el tokenizador a 0,22. El contraste del cierre, que rehízo la pasada sobre `40936526`,
   encontró que el comentario de `push.test.js` sobre la rama viva habilitada repetía la razón de `push.js` (0,231), y
   quedó en «Caso 522.» (`e3fa4bc5`).
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra los defectos, el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.

