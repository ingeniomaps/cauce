---
caso: 440
titulo: R9 carga la doctrina de mutación, ausencia y deprecación en cada agente, aunque no escriba ni revise pruebas
estado: resuelto
resuelto-en: 0.115.0
prioridad: baja
version-detectada: 0.114.0
---

# 440 — R9 carga la doctrina de pruebas en cada agente, aunque no pruebe

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **baja**. Sale del 439, ítem 2.

## Resumen

R9 («El artefacto manda», `template/planning/rules/system/commits.md`) tiene 1.012 palabras, el 56 % de `commits.md`, y
se carga en el arranque de cada agente de cada instancia. Lo que rige al entregar —verde no reemplaza al artefacto, y
el criterio que ninguna prueba aserta no está cubierto— es una parte. El resto es doctrina para escribir o revisar una
prueba: la mutación declarada, la aserción de ausencia de una quita, cambiar quién hace algo como quita, la
deprecación, y la confirmación que estorba. Un cargo que no toca pruebas paga leerla en cada arranque.

## Reproducción

Desde la raíz de este repositorio:

```bash
node -e 'const t = require("fs").readFileSync("template/planning/rules/system/commits.md", "utf8")
const r9 = t.split(/^(?=## R\d+)/m).find((p) => p.startsWith("## R9"))
console.log(r9.split(/\s+/).filter(Boolean).length, Buffer.byteLength(r9), Buffer.byteLength(t))'
```

## Síntoma

Corrido el 2026-10-23 sobre la rama de 0.115.0, sin publicar: `1012 5555 10117` —palabras de R9, bytes de R9, bytes de `commits.md`—. Con la
equivalencia del caso 141 (61,9 KB ≈ 15,9 K tokens), R9 son unos 1,4 K tokens por agente; la parte que se mudaría,
unos 1 K.
Las dos son estimaciones: palabras y bytes medidos, tokens por proporción.

## Causa raíz

No es un defecto sino una decisión escrita: `template/planning/rules/README.md`, «Una regla que sólo rige sobre una
superficie», dice que `aplica:` conviene «para lo que es de un dominio acotado […] y no para lo que gobierna cómo se
trabaja: esas se pagan y se cargan». R9 entera se trata como lo segundo.

## Fix propuesto

R9 se queda en `commits.md` con lo que rige al entregar, y la doctrina de mutación, ausencia, deprecación y
confirmaciones pasa a un archivo de `system/` con `aplica:`. Antes de construirlo se deciden tres cosas:

1. **El README.** O se contradice, o se reescribe para que «cómo se trabaja» admita un momento del trabajo —el README
   ya lo admite para `al commitear` (caso 381)—.
2. **El disparador.** Qué texto de `aplica:` hace que quien escribe o revisa una prueba abra el archivo. Lo único medido
   es `al commitear`, con tres agentes en sesiones cortas (caso 381).
3. **El id y las citas.** La parte que se muda necesita un id. Las lecciones de cada instancia citan
   `rules/system/commits.md#R9`, y `engine/planning/lessons.js:36-42` agrupa por esa cita para contar correcciones
   repetidas: moverla parte ese conteo sin aviso.

Se mide con `/agent-eval` sobre los cargos que escriben pruebas, antes y después: es una quita de texto cargado y R9
pide probarla por ausencia de daño.

## Tradeoffs

- Un agente que commitea sin escribir pruebas deja de ver la doctrina. Es el punto, y es también el riesgo: si el
  disparador no lo alcanza cuando sí prueba, la regla deja de regir sin que nada falle.
- `test/planning/planning-template.test.js:73` fija el texto de R9 y se mueve con el arreglo.

## Contexto de descubrimiento

Al revisar el 439, que lo traía como uno de cuatro ítems. Se separó porque, a diferencia de la nota de `runs.md`,
cambia lo que ve el agente y contradice el README.

## Relacionados

- Caso 439: de donde sale.
- Caso 381: la medición de una regla nombrada con `aplica: al commitear`.
- Caso 141: el costo por agente de las reglas cargadas.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («arregla y haz los 2 casos nuevos»). Las tres decisiones las
tomó él: id **R29** nuevo en `system/testing.md`; medir sobre tres cargos clave; y el 441, esperar. Es minor porque
agrega una regla al sistema, como el último cambio de R9 (caso 324, 0.104.0).

El caso, sección por sección:

- **Fix propuesto, el corte.** R9 conserva sus tres primeros párrafos —el artefacto, el criterio sin aserción, el rojo
  previo— y un cuarto que nombra R29. Lo demás pasó entero a R29; sólo cambiaron dos frases que se apoyaban en «el
  párrafo de arriba». R9 bajó de 5.555 a 863 bytes, `testing.md` tiene 5.345, y el bloque de reglas bajó de 51,8
  a 47,2 KB por agente.
- **Decisión 1, el README.** No se contradijo: el README ya admite un momento del trabajo como disparador
  (`al commitear`). Lo que cambió es la lista de qué regla vive dónde, que ahora declara `testing.md` y su `aplica:`.
- **Decisión 2, el disparador.** Se hizo distinto de lo propuesto: «al escribir, revisar o mutar una prueba» dejaba
  afuera a quien escribe una aceptación —la mutación se declara ahí— y a quien quita, depreca o calla una
  confirmación. Quedó `al escribir o revisar una aceptación, una prueba, o un cambio que quita o reemplaza algo`.
- **Decisión 3, el id y las citas.** R29. Las citas `#R9` de las lecciones de cada instancia no se migran: el CHANGELOG
  avisa que el conteo de correcciones repetidas no junta las nuevas con las viejas.
- **La medición.** Se eligió `/agent-eval` sobre tres cargos, y **no servía**: el banco de evaluación no carga el
  bloque de reglas —su `AGENTS.md` sólo dice que las de `planning/rules/` se leen antes de empezar—, así que cargada
  contra nombrada no se distingue ahí. Se midió como el caso 381, abajo.
- **Tradeoffs.** `test/planning/planning-template.test.js` lee ahora R29 en `testing.md`. Las citas a R9 que nombraban
  la parte que se mudó se reapuntaron a R29 (`AGENTS.md`, `agents/README.md`, `code-shape.md`, `autobuild.js` y cinco
  pruebas o arneses); las que nombran lo que queda siguen en R9. El `CLAUDE.md` de este repositorio importa
  `testing.md`, porque acá siempre se escriben pruebas.

**Lo que se corrió para saber que funciona.**

- `test/wiring/rules.test.js`, «R29 se nombra en el bloque y no se carga, y R9 la señala». Mutación en una copia del
  árbol: sin el `aplica:` de `testing.md` se pone en rojo.
- La prueba del README de reglas («los rangos que declara el README son los que hay») se puso en rojo al crear
  `testing.md` sin declararlo, que es lo que cuida; con la línea nueva, verde, y cuenta veintinueve reglas.
- **Sesiones reales con `claude -p`**, sobre un banco `sidecar` instalado fuera del repositorio, con el motor congelado:
  `git archive HEAD` para antes y una copia del árbol de trabajo para después. La única diferencia entre los dos es el
  bloque: antes importa `commits.md` con R9 entera; después importa la R9 corta y nombra
  `testing.md (aplica: …)`. Tres sesiones por grupo y escenario, con pedidos que no nombran la conducta:

  | Pedido | Antes | Después | Abrieron `testing.md` |
  |---|---|---|---|
  | «Escribí la prueba del descuento» | 3/3 mutaron el código en una copia | 3/3 | 0/3 |
  | «Sacá el descuento» | 3/3 probaron por ausencia y lo vieron en rojo con el código viejo | 3/3 | 3/3 |

  Cuando escriben una prueba no abren R29, y no les hace falta para mutar: el rojo previo sigue en R9, que se carga.
  Cuando quitan algo, que es donde R29 dice lo que R9 ya no dice, la abren —`cat ../ops/planning/rules/system/testing.md`
  antes de tocar el código— y la cumplen. USD 0,69 a 0,83 por sesión, unos 8,8 en total.
- **Lo que esa medición no cubre**: son sesiones cortas, tres por grupo y un solo modelo; y no se midió el disparador
  «al escribir una aceptación».
- `npm run ci`: exit 0, 1590/1590, con la cobertura en su piso.

**Revisión del conjunto.** `/code-review high` sobre los casos 439 a 441 (`0fda64cb..d6cfa0ef`) encontró diez hallazgos;
siete son de este caso, en seis puntos: el primero junta dos que describen el mismo defecto.

1. **R9 dejó de cargar lo que no admite excepción.** «Una quita no se entrega sin su aserción de ausencia» se decía a sí
   misma una puerta sin excepción y había quedado en un archivo nombrado. Al escribir una prueba el disparador no se
   activó en ninguna sesión (0/3, arriba), así que declarar la mutación tampoco llegaba; y una quita disfrazada —un
   `CI=true`— no se reconoce como «un cambio que quita algo», que es justo la forma que R29 dice que más se disfraza. La
   medición no lo vio porque el pedido de la quita era explícito. **Se hizo distinto de lo que el caso decidió**: R9
   carga ahora las tres exigencias en un párrafo, y R29 explica cómo cumplirlas. Prueba: `test/wiring/rules.test.js`,
   «R9 carga las tres exigencias de R29 que no admiten excepción», en rojo antes del párrafo; la mutación que lo saca
   la vuelve a poner en rojo. El bloque pasa de 45,9 a 46,3 KB.
2. **El nombre `testing.md` chocaba con el de una regla propia.** El override es por nombre de archivo: una instancia
   que ya tenga su `planning/rules/testing.md` perdía R29 al actualizar. Reproducido sobre una instancia instalada:
   `effectiveRules` devolvía sólo el propio, y `check` avisa «sobrescribe testing.md (override explícito); deja de regir
   R29» —no es silencioso, pero la empresa no lo decidió—. Como el archivo no salió en ninguna versión, se renombró a
   `proof.md`, un nombre que una regla propia difícilmente tenga. La medición de arriba se hizo con el nombre viejo.
3. **R29 se contradecía**: su arranque decía que lo que rige al entregar sigue en R9, y su último párrafo, que la quita
   sin aserción de ausencia «se dice acá y no en una guía». Las dos frases dicen ahora que R9 lo carga.
4. **Las citas `#R9` de las lecciones parten el conteo de correcciones repetidas.** Se decidió que no: con las tres
   exigencias de vuelta en R9, una corrección puede citar con derecho R9 o R29, y un alias de una a la otra juntaría
   correcciones sobre cosas distintas. Queda como lo dice el CHANGELOG.
5. **La prueba del puntero de R9 buscaba espacios simples**, y un ajuste de línea la rompía con el puntero intacto. Ahora
   usa `\s+`, como sus vecinas.
6. **El comentario de historia de pesos de `rules.test.js` había quedado con los cortes rotos.** Rearmado.

**Revisión final de la rama.** `/code-review high` sobre `origin/main...fix/437-443` entero, ya con los cuatro commits
reagrupados y el 442 y el 443 adentro: diez hallazgos. Uno es de este caso.

1. **R9 cargada no decía que cambiar quién hace algo se prueba con el antes y el después** (caso 324): había quedado sólo
   en R29. Ahora es parte de lo que R9 carga. Prueba: el patrón nuevo de «R9 carga las tres exigencias…», en rojo antes
   y con la mutación que lo saca.

**Prueba real del disparador «al escribir una aceptación»**, que la primera medición no cubría. Seis sesiones con
`claude -p`, tres sobre el motor de `origin/main` —R9 entera cargada— y tres sobre la rama —R9 corta y `proof.md`
nombrado—, pidiendo escribir la tarea de rechazar cantidades negativas con su aceptación, sin nombrar la mutación:

| | La aceptación declara la mutación | Abrió `proof.md` |
|---|---|---|
| `main` | 3/3 | — |
| La rama | 3/3 | 1/3 |

Por ejemplo: «Mutación declarada: quitar la comprobación de `qty < 0` tiene que poner en rojo la prueba del
`RangeError`». USD 0,61 a 0,88 por sesión, 4,12 en total.
