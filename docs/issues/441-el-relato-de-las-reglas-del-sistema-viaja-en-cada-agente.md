---
caso: 441
titulo: el relato de los incidentes que originaron cada regla del sistema viaja en el arranque de cada agente
estado: resuelto
resuelto-en: 0.115.0
prioridad: baja
version-detectada: 0.114.0
---

# 441 — El relato de las reglas del sistema viaja en cada agente

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **baja**. Sale del 439, ítem 3.

## Resumen

`conduct.md` y `runs.md` traen párrafos que cuentan el incidente que originó una regla —«en la sesión que originó esta
regla…», «siete millones de tokens…», «cuatro cargos independientes…»— y se cargan en cada agente. Parte de ese texto
es relato y parte es argumento: R11 pide que el porqué diga «el caso que la forzó», y el párrafo de R14 sobre los cuatro
cargos es el que explica por qué ese modo de fallo se parece a la prudencia.

## Reproducción

No hay comando que lo mida: separar relato de argumento es una lectura. La aproximación que se usó en el 439, desde la
raíz de este repositorio:

```bash
node -e 'const fs = require("fs")
const re = /originó|sesión que|instancia que|instancias? real|Pasó |pasó dos|se perdieron|millones de tokens|tokens? por vez|caso \d+\)|en la que|lo vivió|GB|cuatro cargos/
for (const f of ["conduct", "runs", "commits"]) {
  const t = fs.readFileSync("template/planning/rules/system/" + f + ".md", "utf8")
  const hits = t.split(/\n\s*\n/).filter((p) => !p.startsWith("#") && re.test(p))
  console.log(f, hits.length, hits.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0))
}'
```

## Síntoma

Corrido el 2026-10-23 sobre la rama de 0.115.0, sin publicar, ya sin la nota que el 439 llevó al README:

```
conduct 3 194
runs 4 301
commits 0 0
```

En `runs.md`, 55 de las 301 son un falso positivo («Y si ya pasó, se dice» es una instrucción): quedan 246. En
`commits.md` el patrón no ve el incidente que R9 sí trae («Poner `CI=true` […] borró el árbol de dependencias de un
proyecto real»). Unas 440 palabras, ~2,5 KB: estimación.

## Causa raíz

El relato está dentro del texto de la regla, que es lo que se carga. No hay un lugar del sistema que no se cargue para
la historia de cada regla.

## Fix propuesto

Escribir primero el criterio —qué párrafo es relato y cuál es argumento— y recorrer las reglas con él. El relato va a un
archivo que no se carga, y cada regla queda con su porqué de una línea y el puntero. Se mide con `/agent-eval` sobre los
cargos que más cayeron en R14, antes y después.

## Por qué se aplazó, y por qué no correspondía

Se aplazó el 2026-10-23 hasta «el ensamblaje del 2026-11-01», con R22: ese ensamblaje decidiría si bajó el 47 % de
rojos del catálogo que son R14, y editar `conduct.md` antes contaminaría la medición. Se reabrió el mismo día, porque
contrastado no se sostiene:

- El ensamblaje no mide: su paso `evaluate` «no habla con ningún modelo — lee los veredictos ya registrados y valida
  controles» (`.github/workflows/agent-learning.yml:343`).
- Ningún código calcula ese porcentaje: `unverified_tool_or_engine_behavior_asserted_as_fact` no aparece en `engine/`,
  `automatization/` ni `.github/`. El 47 % fue un recuento a mano del 2026-09-02, y repetirlo es otro recuento.
- Los 40 registros de evaluación de octubre ya están escritos —el último del 2026-10-16— y sólo 2 nombran `conduct.md`:
  el banco de evaluación no carga el bloque de reglas.
- `conduct.md` cambió cinco veces desde el 2026-09-02 (`git log --since=2026-09-01 -- template/planning/rules/system/conduct.md`):
  no había un piso quieto que proteger.

Lo que sí queda en pie es que un cambio de prosa puede mover conducta, y eso pide medir antes y después, no esperar.

## Tradeoffs

- Sacar el relato es una quita escrita como limpieza (R9): cambia conducta, y se prueba con evaluación, no con la suite.
- Una regla sin su incidente convence menos a quien la lee por primera vez; el puntero lo compensa sólo si se sigue.
- Mueve la ventana de KB de `test/wiring/rules.test.js`.

## Contexto de descubrimiento

Al revisar el 439, que lo traía como uno de cuatro ítems. Se separó por riesgo y por fecha.

## Relacionados

- Caso 439: de donde sale.
- Caso 440: la otra parte del 439 que cambia lo que ve el agente.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («hazlo y midelo»), después de que la revisión mostrara que
el ahorro era menor que el estimado y de recomendar cerrarlo como «se decidió que no». Va en la misma versión que el 440.

El caso, sección por sección:

- **Resumen y Síntoma: el tamaño era otro.** Leídos enteros, no hay párrafos de relato puro: cada candidato junta la
  instrucción, el argumento y una o dos frases que cuentan el incidente, y el de R22 («Y si ya pasó, se dice») era un
  falso positivo del patrón. Lo que sale son seis frases, 241 palabras y 1.390 bytes —el 2,9 % de lo que cargaba cada
  agente—, no las ~440 palabras estimadas.
- **Fix propuesto, el criterio escrito.** Es relato la frase que cuenta lo que pasó —una sesión, un número de esa
  sesión— y que se puede sacar sin que la regla pierda su instrucción ni su porqué. Lo que argumenta se queda: en R14,
  «se parece a la prudencia» y quién paga el rótulo; en R24, que el trabajo frena en la puerta y no en el código.
- **Fix propuesto, el destino.** Las seis frases pasaron, con su texto, a «De dónde salió cada regla» al final de
  `template/planning/rules/README.md`, que `effectiveRules` no carga (`engine/core/ownership.js:226`). Dos frases que
  quedaron colgando se ajustaron sin cambiar lo que dicen: R14 conserva el porqué en una línea («Nada de lo rotulado es
  falso, y quien recibe la entrega paga con una sesión entera lo que costaba abrir un enlace»), y en R24 «el archivo se
  movió» pasó a «el archivo puede haberse movido», porque sin el incidente al lado ya no tenía a qué referirse.
- **Fix propuesto, la medición.** Se hizo con sesiones reales y no con `/agent-eval`, por lo que encontró el 440: el
  banco de evaluación no carga el bloque de reglas. Abajo.
- **Por qué se aplazó.** Por una razón que no se sostenía, escrita arriba con sus hechos; se reabrió el mismo día.
- **Tradeoffs.** «Sacar el relato cambia conducta»: medido, abajo, sin cambio. «Una regla sin su incidente convence
  menos»: el incidente sigue a un archivo de distancia, en el README que viaja con cada instancia. «Mueve la ventana de
  KB»: `test/wiring/rules.test.js` fija 45,x, con la entrada «caso 441».

**Lo que se corrió para saber que funciona.**

- `test/wiring/rules.test.js`, «el relato de los incidentes no viaja en lo que carga cada agente», sobre una instancia
  instalada: ninguna de las seis frases está en un archivo que el bloque carga, y las seis están en el README. Antes de
  moverlas, en rojo: `/siete\s+millones\s+de\s+tokens/ sigue en una regla que se carga`. Mutación en una copia del
  árbol, devolviendo `runs.md` a `HEAD`: el mismo rojo.
- **Sesiones reales con `claude -p`**, sobre un banco `sidecar` instalado fuera del repositorio, con el motor congelado.
  La línea de base reusó la plantilla «después» del 440, que tenía las reglas idénticas a las del repositorio
  (`diff -r` vacío). El pedido —documentar qué archivos toma `node --test` solo y si los corre en paralelo— no nombra la
  conducta, y el dato se comprueba con una invocación inocua:

  | | Comprobaron el dato con un experimento | Dejaron el registro escrito |
  |---|---|---|
  | Antes, con el relato | 3/3 | 1/3 |
  | Después, sin el relato | 3/3 | 3/3 |

  Lo que lo refutaba —que después comprobaran menos— no ocurrió. La subida del registro no se lee como mejora: con tres
  por grupo es varianza. USD 0,78 a 0,88 por sesión, 4,91 en total.
- **Lo que no se midió**: los relatos de R20, R21, R24 y R26 no tienen un escenario en sesiones cortas —una re-corrida,
  una reanudación, un ancla vieja, dos revisores a la vez—; se midió el de R14, que es el que más pesaba.
- `npm run ci`: exit 0, 1590/1590, con la cobertura en su piso.

**Revisión del conjunto.** De los diez hallazgos de `/code-review high` sobre los casos 439 a 441, tres son de éste.

1. **La frase puente de R14 se leía como una afirmación universal**: «Nada de lo rotulado es falso» dejaba en la regla
   que prohíbe afirmar sin registro una propiedad general sin registro. Ahora dice lo que es cierto siempre: «rotular
   "hipótesis" no afirma nada falso, y aun así quien recibe la entrega paga con una sesión entera…».
2. **La frase de R26 que pasó al README quedó confusa**: «dos revisores … fueron cuatro en cuatro minutos». Ahora:
   varios revisores lanzaron la misma suite, cuatro corridas en cuatro minutos.
3. **`process.md` también carga relato** —«327k tokens», «594k tokens», «42k tokens»—, y la prueba sólo busca las seis
   frases de este caso. No le tocaba a éste, que se acotó a los archivos que nombraba el 439: **salió como caso propio,
   el 443**, con su medición. Y R26 sigue abriendo con «los tres se ganaron con una corrida perdida»: se dejó, porque
   es cierto y el incidente sigue a un archivo de distancia.
