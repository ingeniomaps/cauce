---
caso: 150
titulo: Cinco pruebas necesitan un `.git` para correr, así que la copia que R23 manda usar no puede ejecutar la suite y sus fallos hablan de otra cosa
estado: abierto
prioridad: media
version-detectada: 0.90.0
---

# 150 — La regla manda probar en una copia y la copia no puede correr las pruebas

**🔴 abierto** · detectado en 0.90.0 · prioridad **media** — arreglado y a la espera de que **0.90.0** se
publique, con el recorrido abajo

## Resumen

`conduct.md` —R23— es explícito:

> Un cambio que puede hacer fallar la herramienta que las pruebas invocan se ejercita en una copia, nunca
> en el árbol que contiene el trabajo. Y una mutación que apaga una defensa se corre en una copia
> **siempre**.

La forma barata de hacer esa copia es `git ls-files | tar` o `git archive`, y ninguna de las dos trae
`.git`. **Cinco pruebas lo necesitan**, repartidas en tres archivos:

    test/instance/delivery.test.js   2 — recorren lo trackeado del molde
    test/repo/repo.test.js           2 — recorren lo trackeado del repositorio
    test/repo/suite.test.js          1 — cuenta las pruebas declaradas

El enunciado original decía «siete suites» y estaba mal: se contaron los archivos que **mencionan**
`git ls-files`, no los que fallan sin él. `evaluations` y `ci-schedule` lo nombran en un comentario o en
un regex sobre texto, `hooks` lo escribe dentro de un fixture, y `coverage-floors` ya declara su salto
desde el arreglo del 148. Contar menciones en vez de medir es el mismo error que este caso denuncia.

## Reproducción

```bash
S=$(mktemp -d)
git archive HEAD | (cd "$S" && tar xf -)
cd "$S" && node --test "test/**/*.test.js"
```

## Síntoma

Cinco fallos, y ninguno menciona git:

```
✖ todo lo que documenta el upgrade preserva la versión exacta
✖ cada archivo propio del molde declara cómo llega a una instancia que ya existe
✖ ningún comentario cita algo que dejó de existir
✖ ningún archivo del repositorio nombra la ruta absoluta de una máquina
✖ la suite no encoge sin que se vea
    AssertionError: la suite declara 0 pruebas y el piso es 505: se perdieron 505.
    Si es a propósito, bajá SUITE_FLOOR en el mismo commit y decí por qué; si no, algo pisó un archivo.
```

El mismo árbol clonado con `.git` da **824 pruebas y 0 fallos**.

## Causa raíz

No hay un archivo culpable: es la suma de dos cosas correctas por separado. Las cinco pruebas usan
`git ls-files` porque **lo trackeado es lo que define al repositorio** —contar archivos del disco
mediría los temporales de otras pruebas—, y eso está bien. Y R23 manda copiar. Lo que falta es que
alguna de las dos diga que no se combinan.

## Lo que ya costó

- **Dos arneses de esta sesión** nacieron rotos por esto y hubo que rediseñarlos: el primero asumía que
  «la copia intacta pasa», que es falso.
- **Un falso hallazgo grave, a punto de reportarse.** Barriendo las cinco últimas versiones publicadas con
  `git archive`, las cinco daban 5 fallos. Clonadas de verdad dan **0**. La conclusión que estuvo a un
  paso de escribirse era «se publicaron cinco versiones con la suite en rojo».

## Fix propuesto

No está decidido.

1. **Que las cinco se salteen con su razón cuando no hay `.git`**, como hacen con `process.platform ===
   'win32'`. Barato y honesto: la suite no miente sobre el entorno. Deja la copia sin esa cobertura, que
   es lo que ya pasa hoy, pero dicho.
2. **Un helper compartido que copie con `.git`** —`git clone --no-hardlinks` en vez de `tar`— y que R23
   nombre esa forma. Más caro por copia y hace que la copia sí corra la suite entera.
3. **Documentarlo en `AGENTS.md`** sin tocar código, en la sección de cómo se prueba acá.

La 1 y la 3 se complementan; la 2 las hace innecesarias y cuesta más.

## Tradeoffs

- La 1 deja cinco pruebas sin correr en una copia, y un salto que nadie mira se vuelve invisible con el
  tiempo.
- La 2 clona el repositorio entero en cada arnés que hoy hace un `tar`; hay que medir cuánto tarda.
- La 3 sola no impide que el próximo arnés nazca roto: sólo explica el cadáver después.

## Prioridad

**Media.** No hay un defecto de producto detrás: el toolkit funciona. Lo que está roto es la forma de
medirlo, y eso ya produjo un falso positivo grave en esta misma sesión.

## Contexto de descubrimiento

Salió de construir el arreglo del caso 148, el 2026-09-14, cuando dos arneses distintos fallaron por la
misma razón y el barrido de versiones publicadas devolvió cinco falsos rojos.

## Relacionados

- **148** — el caso en cuyo arreglo apareció, tres veces.
- **147** — su cierre también usó copias para mutar, y se salvó por usar `git ls-files` desde el repo real.

## Cierre

**Construido · pasa a `resuelto` con la publicación de 0.90.0** · `test/support/environment.js`,
`test/instance/delivery.test.js`, `test/repo/repo.test.js`, `test/repo/suite.test.js`, `CHANGELOG.md`

Se tomó la **opción 1**, y la **3 quedó cubierta sin escribirla aparte**: la razón vive en el helper, que
es lo que alguien lee cuando se topa con el salto. La **2** se descartó con un número.

### Contra lo que el caso enumeró

- **El enunciado estaba mal y se corrigió antes de arreglar nada.** Decía «siete suites» y son **cinco
  pruebas en tres archivos**. Las otras cuatro pasan sin `.git`: `evaluations` y `ci-schedule` mencionan
  `git ls-files` en un comentario o en un regex sobre texto, `hooks` lo escribe dentro de un fixture, y
  `coverage-floors` ya declaraba su salto desde el 148. Se habían contado **menciones** en vez de medir —
  el mismo error que este caso denuncia, cometido al escribirlo.
- **Opción 1, que se salteen con su razón** — construida. Un helper `inRepo()` en el support y el salto
  declarado en las cinco, cada uno diciendo qué falta: «sin `.git` no hay índice que contar», «…del que
  leer lo trackeado», «…corpus trackeado que recorrer».
- **Opción 2, un helper que copie con `.git`** — **se decidió que no, con el número que el caso pedía
  medir.** `git clone --no-hardlinks` tarda **274 ms** contra **85 ms** del `tar`, y deja **64 MB** contra
  30 MB. Pero lo que la descarta no es el costo: es que **hoy un solo arnés copia el árbol**, así que
  resolvería el caso para ese uno y dejaría el síntoma intacto para cualquier otra corrida sin `.git` —
  un `git archive`, un tarball descargado, un contenedor sin historia—.
- **Opción 3, documentarlo en `AGENTS.md`** — **no hizo falta como cambio aparte.** El caso decía que
  «sola no impide que el próximo arnés nazca roto», y tenía razón; con la 1 puesta, el próximo arnés no
  nace roto: se saltea y dice por qué. La razón quedó donde se lee, no en un documento que hay que
  recordar.
- **Tradeoff «la 1 deja cinco pruebas sin correr en una copia, y un salto que nadie mira se vuelve
  invisible»** — vigente y aceptado. Lo que lo acota es que el salto **se ve**: `node --test` reporta
  `skipped` con su razón, así que una copia que saltea cinco lo dice en la misma salida donde antes
  mentía.
- **Tradeoff «la 2 clona el repositorio entero en cada arnés»** — medido y resuelto arriba.
- **Tradeoff «la 3 sola no impide que el próximo arnés nazca roto»** — resuelto por la 1.

### Lo que el caso no preveía

- **Tres de los archivos no importaban nada del support.** `delivery`, `repo` y `suite` sólo traían
  módulos de node, así que el arreglo agregó su primer `require` compartido. No es un detalle: significa
  que hasta ahora no había nada común entre las pruebas que juzgan el repositorio, y por eso cada una
  fallaba a su manera.

### Qué se corrió

- **Qué falla de verdad sin `.git`**, archivo por archivo en una copia: `delivery` 2, `repo` 2, `suite` 1,
  y **cero** en las otras cuatro que el enunciado acusaba.
- **El costo de las dos formas de copiar**, tres corridas cada una: `tar` 85/84/89 ms y 30 MB;
  `git clone --no-hardlinks` 274/276/274 ms y 64 MB.
- **El arreglo en la copia sin `.git`**: los tres archivos pasan de **5 fallos** a **0 fallos y 5
  salteadas** —`delivery` 2/4 con 2 skipped, `repo` 13/15 con 2, `suite` 0/1 con 1—.
- **En el repositorio real no se saltea nada**: `delivery` 4/4, `repo` 15/15, `suite` 1/1, `skipped 0`.
- **Mutación**: con `inRepo()` devolviendo siempre `true`, los **cinco** fallos vuelven exactos. El salto
  muerde y no es decorativo.
- **Verde**: `npm test` → **829 pruebas, 829 pass, fail 0, skipped 0**; `npm run ci` exit 0; `repo.test.js`
  15/15.
- **Pasada R11 a 0.22** entre el helper y el caso: **ningún par**.
