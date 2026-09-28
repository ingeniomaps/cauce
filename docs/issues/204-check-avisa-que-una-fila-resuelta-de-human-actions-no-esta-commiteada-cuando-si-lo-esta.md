---
caso: 204
titulo: check avisa que una fila resuelta de HUMAN_ACTIONS no está commiteada cuando sí lo está
estado: resuelto
resuelto-en: 0.99.2
prioridad: media
version-detectada: 0.98.0
---

# 204 — `unrecordedHumanActions` depende de `git log -S`, que no encuentra filas que están en el commit

**🟢 resuelto en 0.99.2** · detectado en 0.98.0, reproducido en 0.99.1 · prioridad **media**.

**Prioridad media**: es un falso positivo en `check`, y no bloquea: es un `⚠` y `check` sale igual. No
llega a Ready por este camino —Ready es un agente que lee el archivo, no llama a
`unrecordedHumanActions` (lo único que la llama es `engine/cli/validate.js:135`)—, así que lo que dice el
comentario de la función es por qué existe el aviso, no un efecto del falso positivo. Lo que cuesta es el
aviso permanente sobre algo que está bien, que es lo que enseña a no leer los avisos.

## Resumen

Para saber si una fila resuelta de `HUMAN_ACTIONS.md` quedó en algún commit, `unrecordedHumanActions`
corre `git log -S<fila entera>`. En una instancia real, una fila de 1.583 caracteres **está** en el commit y
`git log -S` no la encuentra, así que `check` avisa «figura resuelta y ningún commit la registró».

## Reproducción

**La fila original es de una instancia privada** y no se puede copiar acá; la reproducción sintética está en
«El mecanismo», más abajo. Lo que se comprobó sobre la fila original, con git 2.43.0:

| Prueba | Resultado |
|---|---|
| `git show <primer commit>:planning/HUMAN_ACTIONS.md \| grep -cF -- "$fila"` | `1`: la fila está |
| `git log --format=%h -S"$fila" -- planning/HUMAN_ACTIONS.md` | vacío |
| `git log -S` con sólo el slug de la fila | encuentra el primer commit |
| La fila sola en un archivo nuevo, `git diff --no-index -S"$fila" vacío archivo` | la encuentra |
| El archivo real entero, misma prueba | no la encuentra |
| Sólo la fila y las dos líneas anteriores del archivo real | no la encuentra |
| La fila y **una** de esas dos líneas, cualquiera | la encuentra |
| Una fila inventada de 2.381 caracteres, con hasta 64 KB de relleno ASCII o UTF-8 antes | la encuentra siempre |

### El mecanismo (verificado el 2026-09-28)

Es un defecto de git, no de la fila. El `-S` literal busca con el Boyer-Moore de `kwset.c`, cuya tabla de
saltos es `unsigned char delta[NCHAR]` (`kwset.c:119` en v2.43.0, igual en `master`). La llena
`delta[U(kwset->target[i])] = kwset->mind - (i + 1)` (`kwset.c:451`): con una aguja de más de 256 bytes el
salto se trunca módulo 256. Un byte cuya **última** aparición en la aguja queda exactamente a 256, 512… bytes
del final recibe salto 0, el buscador lo toma por el último carácter de la aguja, falla la comparación y
avanza `md2`, que puede pasar por encima de la coincidencia real. Por eso depende del texto de alrededor: tiene
que caer ese byte en la posición justa del texto.

Tres comprobaciones, con git 2.43.0:

- **Una biyección aleatoria de bytes** aplicada a la fila y al archivo conserva el fallo: es la estructura de
  igualdades lo que importa, no el contenido.
- **La fila real** tiene un solo byte en esa condición: `b`, con su última aparición a 256 bytes del final
  (fila de 1.604 bytes).
- **Reproducción sintética**, construida desde el mecanismo: aguja de `a`, con `z` al final y una `x` a 256
  bytes del final; el texto es `q`×k, `x`, `q`×k y la aguja. Sobre k de 0 a 599:

  | Aguja | `x` a … del final | k que fallan |
  |---|---|---|
  | 256 bytes | 255 | 0 de 600 |
  | 257 bytes | 256 | 4 de 600 (255, 256, 510, 511) |
  | 300 bytes | 256 | 90 de 600 |
  | 513 bytes | 512 | 2 de 600 |
  | 600 bytes | 512 | 133 de 600 |

  Con 256 bytes no falla nunca, que es lo que el truncado predice. Se corrió con
  `git diff --no-index -S<aguja> vacío archivo`, que pasa por el mismo `diffcore-pickaxe` que `git log -S`.

Esto da además la prueba del arreglo sin datos privados: un `HUMAN_ACTIONS.md` con una fila resuelta de 257
bytes armada así, commiteada, tiene que dar cero avisos.

## Síntoma

```
⚠ HUMAN_ACTIONS.md: `<slug-uno>`, `<slug-dos>` — **<título>** figura resuelta y ningún commit la registró
```

con el archivo sin cambios en el árbol de trabajo (`git status` limpio) y la fila presente en el blob del
commit.

## Causa raíz

`engine/core/repos.js:140-154`, `unrecordedHumanActions`:

```js
const found = git(repo, 'log', '--format=%h', `-S${row.raw}`, '--', relative)
return found.status === 0 && !found.stdout.trim()   // vacío se lee como «nunca se commiteó»
```

La premisa es que `-S` con la línea entera encuentra toda línea commiteada. Para esta fila no se cumple.

## Fix propuesto

No depender del pickaxe. Lo que la función quiere saber es si **esa** fila, con ese estado, está en lo
commiteado, y para eso alcanza con el archivo en `HEAD`:

```js
const committed = git(repo, 'show', `HEAD:${relative}`)
if (committed.status !== 0) return []
const lines = new Set(committed.stdout.split('\n'))
return rows.filter((row) => row.resolved && !lines.has(row.raw))
  .map((row) => `HUMAN_ACTIONS.md: ${row.task} figura resuelta y ningún commit la registró`)
```

Es una sola llamada a git en vez de una por fila, y una comparación de líneas exactas en vez de una
búsqueda.

**Probado a mano** (2026-09-28) en dos instancias, llamando a `readHumanActions` y comparando contra
`git show HEAD:planning/HUMAN_ACTIONS.md`: en la del caso, de 20 filas resueltas el pickaxe avisa 1 y el fix
0. En otra, con `HUMAN_ACTIONS.md` modificado sin commitear, los dos avisan las mismas 4 filas, que son
avisos correctos. Pasar a `--pickaxe-regex` con la fila escapada no es la salida: esquiva `kwset`, pero sigue
preguntando fila por fila.

## Tradeoffs

- **Cambia qué se pregunta**: «está en `HEAD`» en vez de «existió en algún commit». Una fila resuelta,
  commiteada y después editada en el árbol sin commitear pasa a avisar. Es lo que el caso 121 quería
  atrapar: esa versión nadie la dejó escrita.
- Una fila que se commiteó en otra rama y no está en la actual pasa a avisar. Hoy también: `git log` sin
  `--all` mira sólo la historia de `HEAD`.
- `row.raw` sale del archivo **sin comentarios** (`parser.js:360`, `withoutComments`). Una fila con un
  `<!-- … -->` adentro no va a coincidir con su línea en `HEAD`, y el fix la avisaría. Hoy el pickaxe
  tampoco la encontraría, así que no es una regresión, pero la prueba debería fijarlo en un sentido.
- El 086 decidió callar cuando no hay historia; con `git show` la degradación es la misma
  (`status !== 0` → `[]`).

## Contexto de descubrimiento

Revisando los avisos de `ops check` en una instancia en modo `sidecar` recién pasada a repositorio propio.
La fila avisada tenía la decisión escrita en detalle y estaba commiteada desde el primer commit del repo.
Nada en la instancia se podía corregir: el aviso venía del chequeo.

## Relacionados

- 121: el que introdujo este chequeo, y por qué Ready rechaza la fila.
- 086: la degradación sin historia, que el fix conserva.

## Cierre

**Resuelto en 0.99.2 por el fix propuesto, con un agregado.** Recorriendo lo que el caso enumeró:

- **Fix propuesto → se hizo.** `unrecordedHumanActions` compara las filas contra
  `git show HEAD:planning/HUMAN_ACTIONS.md` línea por línea (`engine/core/repos.js`). El chequeo previo con
  `git log` se fue: si el archivo no está en `HEAD`, `git show` falla y la función calla igual.
- **El mecanismo, que el caso dejaba como hipótesis → se estableció** (sección «El mecanismo»), y el
  comentario de la función dice por qué no se usa el pickaxe.
- **La reproducción sintética que faltaba → se hizo y quedó como prueba.** «una fila resuelta larga y
  commiteada no se avisa…» (`test/planning/human-actions.test.js`) arma la fila con una `x` a 256 bytes
  del final y busca el relleno hasta que `git diff --no-index -S` la pierde. Afirma esa precondición antes
  de afirmar el resultado, así que el día que git arregle `kwset` la prueba lo dice en vez de pasar vacía.
- **Tradeoff 1, «está en `HEAD`» en vez de «existió en algún commit» → se aceptó.** La prueba del 121 sigue
  intacta: una fila que pasa a resuelta sólo en el árbol avisa.
- **Tradeoff 2, otra rama → sin cambio**, como decía el caso.
- **Tradeoff 3, la degradación del 086 → se conservó**: sin repositorio o sin el archivo commiteado no
  avisa. Sin repositorio lo cubre la prueba del 121; el archivo sin commitear en un repositorio con
  historia se corrió aparte: `git ls-files` no lo lista, hay una fila resuelta, y `check` da 0 avisos.
- **Tradeoff 4, la fila con un comentario adentro → se hizo distinto de lo que decía el caso.** En vez de
  dejarlo fijado como aviso, el archivo commiteado pasa por la misma limpieza que el parser
  (`P.withoutComments`, que `validate.js` le pasa como `clean`), y la fila se reconoce. Prueba: «una fila
  resuelta con un comentario adentro se reconoce en el commit».
- **La prioridad → se corrigió en el caso**: el falso positivo no llega a Ready.

**Probado corriendo.** Mutaciones, en una copia del árbol con las pruebas nuevas adentro: volver al pickaxe
pone rojas las dos pruebas nuevas (1 de 3 pasa) y la del 121 sigue verde; quitar `clean` pone roja sólo la
del comentario (2 de 3). Con el arreglo pasan las 3. En el banco `suelto`, hecho repositorio, con la fila
sintética commiteada: `git log -S` con la fila devuelve vacío, `node tools/ops.js check planning` con el
motor arreglado da 0 avisos, y el motor de `main` sobre el mismo banco da
`⚠ HUMAN_ACTIONS.md: t-002 figura resuelta y ningún commit la registró`. Pasando otra fila a resuelta sólo
en el árbol, el motor arreglado la avisa. En la instancia del caso, `check` da 0 avisos donde daba 1; en
otra instancia con `HUMAN_ACTIONS.md` modificado sin commitear siguen los mismos 4, que son correctos.
`npm run ci`: 1005 pruebas, exit 0.
