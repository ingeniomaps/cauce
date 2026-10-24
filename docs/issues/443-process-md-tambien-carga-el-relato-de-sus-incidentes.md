---
caso: 443
titulo: process.md también carga en cada agente el relato de los incidentes que originaron R17, R25 y R28
estado: resuelto
resuelto-en: 0.115.0
prioridad: baja
version-detectada: 0.115.0
---

# 443 — `process.md` también carga el relato de sus incidentes

**🟢 resuelto en 0.115.0** · detectado en 0.115.0 · prioridad **baja**. Sale de la revisión del 441.

## Resumen

El 441 sacó de las reglas cargadas las frases que cuentan el incidente que originó cada regla, pero sólo en
`conduct.md` y `runs.md`, que eran los archivos que el 439 había medido. `process.md` también se carga en cada agente
y trae el mismo tipo de frase: «en otra costó 327k tokens», «la corrida siguiente gastó 594k tokens», «a 42k tokens
por vez».

## Reproducción

Desde la raíz de este repositorio, con el patrón del 441 más las cifras en `k tokens`:

```bash
node -e 'const fs = require("fs")
const re = /originó|sesión que|instancia que|instancias? real|Pasó |pasó dos|se perdieron|millones de tokens|\d+k tokens|tokens? por vez|en la que|lo vivió|GB|cuatro cargos|de \d+ tareas/
for (const f of ["process", "code-shape", "conduct", "runs", "commits", "proof"]) {
  const t = fs.readFileSync("template/planning/rules/system/" + f + ".md", "utf8")
  const hits = t.split(/\n\s*\n/).filter((p) => !p.startsWith("#") && re.test(p))
  console.log(f, hits.length, hits.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0))
}'
```

## Síntoma

Corrido el 2026-10-23 sobre la rama de 0.115.0, sin publicar: `process 4 355`, y 0 en `code-shape`, `conduct`,
`commits` y `proof`; `runs 1 55` es el falso positivo de R22 que el 441 ya identificó. Los cuatro párrafos de
`process.md` son mixtos, como los del 441: instrucción y argumento con una o dos frases de incidente, así que lo que
saldría es menos que esas 355 palabras.

## Causa raíz

El 441 se acotó a los tres archivos que nombraba el 439, y la prueba que agregó (`test/wiring/rules.test.js`, «el
relato de los incidentes no viaja en lo que carga cada agente») busca seis frases concretas, no la clase.

## Fix propuesto

El mismo del 441: el criterio escrito —relato es la frase que cuenta lo que pasó y se puede sacar sin que la regla
pierda instrucción ni porqué—, las frases a «De dónde salió cada regla» del README de reglas, y una medición antes y
después con un pedido donde la regla importe.

## Tradeoffs

- El ahorro es chico: menos de 355 palabras, del orden de 1 KB de los 46,3 que carga cada agente. El 441 se hizo por
  pedido explícito con un ahorro parecido; éste puede no valer la medición.
- Mueve la ventana de KB de `test/wiring/rules.test.js`.

## Contexto de descubrimiento

La revisión de código de los casos 439 a 441 marcó que `process.md:90,104,123` seguía cargando cifras de incidentes.

## Relacionados

- Caso 441: el mismo cambio en `conduct.md` y `runs.md`.
- Caso 439: de donde salió la medición original.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («haz el plan y organiza para cerrar el 442 y 443»), en la
misma versión que el 441, con el mismo criterio y el mismo destino.

El caso, sección por sección:

- **Resumen: las cifras.** Salieron las cuatro frases de incidente de `process.md`: el caso de las dos críticas y las
  432 tareas con sus 327k tokens (R17), la tarea partida en cuatro y los 594k tokens (R25), y las dos veces del mismo
  día a 42k tokens (R28). Cada párrafo conserva su argumento: «es raro y sale caro», «rompe sin que nada falle», «se
  paga entero y en la puerta de entrada». Las frases viven ahora, con su texto, en «De dónde salió cada regla» del
  README de reglas. El bloque baja de 46,3 a 45,6 KB por agente.
- **Causa raíz: la prueba buscaba seis frases y no la clase.** Sigue buscando frases, ahora diez: suma las cuatro de
  éste. Una prueba de la clase —«ninguna frase cuenta un incidente»— exigiría decidir con un patrón qué es relato,
  que es la lectura que el 441 mostró que un patrón no hace (falsos positivos como el de R22). Se decidió que no.
- **Fix propuesto, la medición.** Se hizo, abajo, sobre R17: es la frase más conductual de las cuatro.
- **Tradeoffs.** «El ahorro es chico»: 0,7 KB por agente; se hizo por pedido. «Mueve la ventana de KB»:
  `test/wiring/rules.test.js` fija 45,x, con la entrada «caso 443».

**Lo que se corrió para saber que funciona.**

- La prueba del 441, «el relato de los incidentes no viaja en lo que carga cada agente», con las cuatro frases nuevas:
  en rojo antes de moverlas (`/un\s+número\s+con\s+unidades/ sigue en una regla que se carga`), verde después.
  Mutación en una copia del árbol, devolviendo `process.md` a `HEAD`: el mismo rojo.
- **Sesiones reales con `claude -p`**, sobre un banco `sidecar` instalado fuera del repositorio, con el motor congelado
  —`git archive HEAD` para antes, el árbol de trabajo para después; entre las dos plantillas sólo difieren
  `process.md` y el README de reglas (`diff -rq`)—. El pedido: armar el hito para un cambio del descuento que comercial
  todavía no decidió, sin nombrar la regla. Lo que R17 prohíbe es escribir la decisión como tarea:

  | | Decisión escrita como tarea | Decisión como acción humana que bloquea la tarea |
  |---|---|---|
  | Antes, con el relato | 0/3 | 3/3 |
  | Después, sin el relato | 0/3 | 3/3 |

  Lo que lo refutaba —más decisiones en la cola después— no ocurrió. `check` pasó en las seis. USD 0,65 a 0,77 por
  sesión, 4,37 en total.
- **Lo que no se midió**: los relatos de R25 y R28 no tienen un escenario en sesiones cortas —un renombre a mitad de
  camino, un archivo de bloqueo olvidado—.
- `npm run ci`: exit 0, 1591/1591, con la cobertura en su piso.

**Pruebas reales antes de la versión**, a pedido del dueño el 2026-10-23 («corre todas las pruebas que se puede»).

- **Los relatos de R25 y R28**, con escenarios propios, tres sesiones con el relato —`process.md` de `origin/main`— y
  tres sin él:

  | Pedido | Con el relato | Sin el relato |
  |---|---|---|
  | R25: «`tarea-medida` en realidad es otra cosa; cambiale el nombre» → el nombre nuevo lleva `(antes: tarea-medida)` | 3/3 | 3/3 |
  | R28: «frená `tarea-medida` hasta que backend confirme» → el freno queda escrito como acción humana y no como un archivo cuya presencia es la señal | 3/3 | 3/3 |

  USD 4,37 y 3,44. La contaminación de la plantilla que declara el 441 también alcanza a estas copias.
