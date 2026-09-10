---
caso: 076
titulo: El carril queda registrado y nadie lo contrasta contra la ceremonia que la tarea recibió
estado: resuelto
resuelto-en: 0.76.0
prioridad: baja
version-detectada: 0.76.0
---

# 076 — Saber con qué carril corrió no es lo mismo que saber si le correspondía

**🟢 resuelto en 0.76.0** · detectado en 0.76.0 · prioridad **baja** — se cerró en la misma versión y con
otro método: el que la propia ADR nombraba y este caso no había leído

## Resumen

El [074](074-el-carril-no-sobrevive-al-cierre-y-ops-006-no-se-puede-auditar.md) puso `lane:` en la
entrada de DONE, y con eso el registro dice **con qué carril corrió** cada tarea. La pregunta que
motivaba guardarlo era otra y sigue sin contestarse: **si ese carril era el que su superficie pedía**.

`OPS-006` advierte el error concreto: elegir el carril por el tamaño del diff y no por la superficie que
toca. Una tarea `express` con cinco condiciones de aceptación es esa señal, y hoy nadie la mira.

## Reproducción

No hay una todavía: hace falta una instancia con entradas que ya declaren `lane:`, y el campo existe
desde 0.76.0. Eso es parte de por qué este caso no se hizo dentro del 074.

## Síntoma

Ninguno. `check` pasa, la entrada se lee completa y el carril está escrito. Lo que no está es el
contraste — la misma forma de R15 que originó el 074, un paso más arriba.

## Fix propuesto

Un aviso de `check` que cruce el carril declarado contra lo que la propia entrada muestra:

- una entrada `express` cuya aceptación tiene más de una condición —`express` existe para el valor
  literal, y varias condiciones son la señal que la ADR nombra—;
- una entrada `full` cuyo `qa:` no describe ninguna verificación observada;
- una `lite` o `full` cuyo `tests:` es `n/a — razón` para todos sus criterios.

Avisos y no errores, por lo mismo que el campo avisa: es un juicio sobre el contenido, y un juicio que
frena una entrega por una heurística se termina apagando.

## Tradeoffs

- **Es una heurística sobre prosa**, no una comprobación de forma. Un falso positivo semanal sobre una
  entrada correcta enseña a ignorar el aviso, y entonces también se ignora el que sí importa.
- **Hoy sería ruido puro**: toda entrada escrita antes de 0.76.0 cae en `sin clasificar`, así que el
  cruce no tendría contra qué cruzar. Por eso lo que lo activa es que el aviso de cobertura del 074
  —«N entrada(s) sin lane:»— llegue a cero en una instancia real.

## Contexto de descubrimiento

Cerrando el 074. Ese caso enumeraba este cruce dentro de su «Fix propuesto» y no se hizo: necesita el
campo poblado para no ser ruido. Sale como caso propio en vez de quedarse adentro de un caso cerrado,
que es donde R15 dice que una dimensión se pierde.

## Relacionados

- [074](074-el-carril-no-sobrevive-al-cierre-y-ops-006-no-se-puede-auditar.md) — puso el campo del que
  esto depende, y de cuyo cierre sale.
- **OPS-006** — la ADR que nombra el error que este cruce buscaría: elegir el carril por el tamaño del
  diff y no por la superficie.

## Cierre

**Resuelto en 0.76.0**, y **ninguna de las tres vías que este caso enumeró es la que se tomó** — porque
antes de empezar se leyó la ADR y ahí estaba escrito el método.

### Lo que la ADR decía y este caso no citó

`OPS-006`, sección «Estado de implementación»:

> Pendiente: no hay medición de si el carril elegido fue el correcto. Se sabría comparando **hallazgos de
> review por carril**, y hoy no se registra esa dimensión en DONE.

O sea que la dimensión que falta no era una heurística sobre la prosa de la entrada: era **la revisión**.
Este caso propuso tres heurísticas sin citar lo que la ADR ya había contestado, y eso es exactamente lo
que R14 llama afirmar un mecanismo sin abrir la fuente — la fuente estaba en el repositorio.

### El recorrido de lo que este caso enumeró

- **«Una entrada `express` cuya aceptación tiene más de una condición» — se decidió que no.** Es una
  heurística sobre prosa y su propio tradeoff la describe: un falso positivo enseña a ignorar el aviso.
  Con la revisión registrada, el mismo error se ve sin heurística ninguna.
- **«Una entrada `full` cuyo `qa:` no describe ninguna verificación» — se decidió que no**, por lo mismo:
  «no describe ninguna verificación» no es una comprobación, es una lectura.
- **«Una `lite` o `full` cuyo `tests:` es `n/a` para todos sus criterios» — se decidió que no, y ésta sí
  era estructural.** Queda sin hacer porque mide otra cosa: que no haya superficie ejecutable no dice
  nada sobre la ceremonia que la tarea recibió, que es lo que este caso perseguía. Si vuelve a hacer
  falta, vuelve como caso propio.
- **Lo que sí se hizo**: `review:` en la entrada de DONE, y el cruce estructural contra `lane:`. Un carril
  que convoca revisor —`directo`, `lite`, `full`— con una revisión que no corrió es la ADR incumplida,
  escrita en el propio registro. `express` queda afuera: es el único que legítimamente no convoca a nadie.
- **Tradeoff «es una heurística sobre prosa» — no se paga**, porque no quedó ninguna heurística: el cruce
  compara dos campos con vocabulario, no interpreta texto.
- **Tradeoff «hoy sería ruido puro porque toda entrada cae en `sin clasificar`» — era una objeción más
  débil de lo que este caso creía.** El cruce sólo mira entradas que declaran un carril real, así que hoy
  produce cero avisos y empieza a producirlos solo. Inerte no es ruidoso. Por eso no hizo falta esperar a
  que la cobertura llegara a cero, que era la condición de activación que este caso se puso.
- **Y el productor ya lo tenía otra vez.** `autobuild` le pasaba al agente que cierra
  `review=<veredicto> por <cargos>, sobre <archivos>` —o «no corrió (el carril express no convoca
  revisor)»— dentro de los hechos, sin dónde ponerlo. Es la misma forma que tenía el carril en el 074.

### Un defecto que este trabajo destapó y venía del 074

`lane:` se agregó a la entrada **sin sumarlo al vocabulario de campos**, y un campo vale hasta el próximo
campo *conocido*: `commit:` se lo estaba tragando. Medido:

```
commit  "abc1234 feat: alta lane: express review: n/a — el carril express no convoca revisor"
lane    "express review: n/a — el carril express no convoca revisor"
```

Nada fallaba, porque `commit:` sigue siendo texto no vacío y el valor de `lane` empieza con la palabra
correcta. Lo encontró la prueba del cruce, que era la primera en poner dos campos nuevos seguidos. Ahora
los dos están en el vocabulario y la prueba del 074 asercia que `commit:` se lee limpio.

### Qué se corrió

- **El defecto del vocabulario, medido antes y después**: la salida de arriba, y después
  `commit: "abc1234 feat: alta"` · `lane: "express"` · `review: "n/a — …"`.
- **`ops check` corrido de verdad** sobre un `planning/` desechable: con `review:` no avisa; sin él cuenta
  las que faltan; y con una entrada `lite` cuya revisión no corrió avisa **nombrando la tarea**, mientras
  la `express` con el mismo `n/a` no dispara nada.
- **Seis mutaciones, las seis en rojo**: sacar los campos del vocabulario —el defecto del 074—, dejar de
  leer `review:`, dejar de contar las que faltan, apagar el cruce, meter `express` entre los que convocan
  revisor —el falso positivo— y que el cierre deje de pedir el campo.
- **La puerta entera**: 650 pruebas, 0 fallos.
- **Lo que no se pudo correr, y se dice**: el cruce sobre datos reales. Hoy no existe ninguna entrada con
  `review:` escrito, así que lo que está probado es que dispara y que no dispara donde no debe, sobre
  entradas fabricadas. La primera vez que hable sobre una tarea de verdad será en una instancia.
