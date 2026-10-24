---
caso: 439
titulo: las reglas del sistema que carga cada agente traen relato, una nota de por qué viven ahí y doctrina de pruebas dentro de commits
estado: resuelto
resuelto-en: 0.115.0
prioridad: media
version-detectada: 0.114.0
---

# 439 — Las reglas del sistema que carga cada agente traen relato y doctrina fuera de lugar

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **media**.

## Resumen

`system/conduct.md`, `system/runs.md` y `system/commits.md` se cargan enteras en el arranque de cada agente de cada
instancia: 6.796 palabras, 38.393 bytes. Con la equivalencia que midió el caso 141 (61,9 KB ≈ 15,9 K tokens) son unos
9,8 K tokens por agente. Una parte de ese texto no le sirve al agente que lo carga:

1. **Una nota sobre el archivo.** El párrafo de `runs.md` que explica por qué esas reglas viven ahí y no en
   `process.md` (el override por nombre, caso 160), 99 palabras. Le sirve a quien mantiene las reglas, no a quien las
   cumple.
2. **Doctrina de pruebas dentro de commits.** R9 («El artefacto manda») tiene 1.012 palabras, el 56 % de
   `commits.md`. La mayor parte trata de mutaciones, aserciones de ausencia, deprecación y confirmaciones que estorban:
   lo que hace falta al escribir o revisar una prueba, que es una parte del trabajo y no todo.
3. **Relato de incidentes.** Párrafos que cuentan la sesión que originó una regla («en la sesión que originó esta
   regla…», «siete millones de tokens…», «cuatro cargos independientes…»). Cuánto es depende de dónde se ponga el
   corte entre contar un incidente y argumentar con él: ver «Síntoma».

Los tres son de naturaleza distinta, se arreglan distinto y no tienen el mismo riesgo: ver «Partición».

## Reproducción

Desde la raíz de este repositorio —el fuente de las reglas que recibe cada instancia—:

```bash
node -e '
const fs = require("fs")
for (const f of ["conduct", "runs", "commits"]) {
  const t = fs.readFileSync("template/planning/rules/system/" + f + ".md", "utf8")
  const rules = t.split(/^(?=## R\d+)/m).filter((p) => p.startsWith("## R"))
    .map((p) => p.match(/## (R\d+)/)[1] + " " + p.split(/\s+/).filter(Boolean).length)
  console.log(f, "palabras", t.split(/\s+/).filter(Boolean).length, "bytes", Buffer.byteLength(t), rules.join(", "))
}'
grep -n "aplica" template/planning/rules/system/*.md | grep -c "^.*:[0-9]*:aplica:"   # 0: ninguna lo declara
```

## Síntoma

Corrido el 2026-10-23 sobre 0.114.0:

```
conduct palabras 3089 bytes 17647 R12 98, R13 491, R23 548, R14 873, R15 574, R19 224, R24 279
runs palabras 1890 bytes 10629 R16 214, R20 420, R21 570, R22 247, R26 298
commits palabras 1817 bytes 10117 R8 377, R9 1012, R10 424
0
```

Las cinco de `system/` suman 53.586 bytes; estas tres, 38.393. Cada regla incluye su título en la cuenta.

**El relato no se reproduce con un comando**, porque separar «contar un incidente» de «argumentar con él» es una
lectura. La versión original del caso daba 539 palabras, medidas en una instancia de una empresa (Acme) marcando a mano
los párrafos que cuentan su origen. Rehecha en el fuente con un patrón (`originó|sesión que|instancia que|millones de
tokens|cuatro cargos|…`) sobre cada párrafo:

- `conduct.md`: 194 palabras en 3 párrafos —coincide con la original—.
- `runs.md`: 400 en 5, de las que 99 son la nota del punto 1 y 55 un falso positivo («Y si ya pasó, se dice» es una
  instrucción). Quedan 246; la original daba 345.
- `commits.md`: 0 con el patrón, igual que la original, y las dos están mal: R9 trae un incidente —«Poner `CI=true`
  para que un gestor de paquetes dejara de confirmar antes de purgar borró el árbol de dependencias de un proyecto
  real»—.

Y buena parte de ese relato es argumento a propósito: R11 pide que el porqué de una regla diga «la restricción, el caso
que la forzó, lo que se probó antes», y el párrafo de R14 que cuenta los cuatro cargos es el que explica por qué ese modo
de fallo se parece a la prudencia.

## Causa raíz

No es un defecto del motor sino una decisión escrita, y lo que el caso pide es revisarla:

- `engine/automation/rules.js:35-58`: `surfaceOf` lee `aplica:` del frontmatter y `split` carga entera toda regla
  que no lo declara. Ninguna de `system/` lo declara.
- `template/planning/rules/README.md`, «Una regla que sólo rige sobre una superficie»: `aplica:` conviene «para lo que
  es de un dominio acotado —un proveedor, un stack, una integración— y no para lo que gobierna cómo se trabaja: esas se
  pagan y se cargan». Las reglas del sistema son eso, y por eso se cargan.
- `engine/automation/rules.js` (`HEAVY`, el comentario que lo precede) ya separa a propósito el peso del sistema del
  de la empresa: el aviso mide sólo lo propio, porque el piso del sistema es un costo aceptado.

Lo que sí es de forma: la nota de `runs.md:6-11` está en un archivo que se carga, y su destino natural —la
lista de qué regla vive en qué archivo— es `template/planning/rules/README.md`, que `effectiveRules` no carga
(`engine/core/ownership.js:226` excluye `README.md`).

## Partición

| Ítem | Qué es | Ahorro | Riesgo | Destino |
|---|---|---|---|---|
| 1. La nota de `runs.md` | forma | 99 palabras, ~0,6 KB | ninguno sobre conducta | se hace en este caso |
| 2. Partir R9 con `aplica:` | decisión de producto | ~700 palabras, ~4 KB (estimado) | conducta: contradice el README y cambia qué ve el agente que prueba | caso propio, con decisión antes |
| 3. Sacar el relato | conducta | ~440 palabras, ~2,5 KB (estimado) | conducta | caso propio |
| 4. Fundir R24 en R14 | — | — | — | se descarta |

**El ítem 4 de la versión original se descarta.** Decía que R24 repite R14, citando «el contraste es el mismo que
pide R14 y por eso no se repite acá» (`conduct.md:242`). Esa frase dice que R24 **no** repite el contraste: lo nombra y
remite. El tema de R24 —una premisa sobre el propio código— es justo lo que R14 deja afuera, como R24 dice al abrir
(`conduct.md:224-225`): «R14 gobierna lo que se afirma de una herramienta, un motor, una norma o un sistema de
terceros. Lo que queda afuera es el código que se está por cambiar». Fundirlas además retira el id R24, que citan 17 archivos, y el README de reglas dice
que un número «no se reordena ni se reusa».

## Fix propuesto

**Ítem 1, en este caso.** El párrafo `runs.md:6-11` pasa a `template/planning/rules/README.md`, junto a la línea de
`system/runs.md`, sin cambiar lo que dice. `runs.md` conserva su párrafo de arranque. Se mueve la ventana de KB de
`test/wiring/rules.test.js` (comentario de `:214`) al peso nuevo. La prueba: una aserción de ausencia —la nota ya no está
en ningún archivo que `effectiveRules` devuelva— vista en rojo antes de mover el párrafo, y una de presencia en el
README.

**Ítem 2, caso propio.** Si se decide, R9 se queda en `commits.md` con lo que rige al entregar —verde no reemplaza al
artefacto, y el criterio que ninguna prueba aserta no está cubierto— y la doctrina de mutación, ausencia, deprecación
y confirmaciones pasa a un archivo de `system/` con `aplica:`. Antes de construirlo hay que decidir tres cosas: si se
contradice el README o se lo reescribe, qué texto de `aplica:` dispara en quien prueba (el caso 381 midió `al
commitear` con tres agentes cortos, no esto), y qué id lleva la parte que se muda. Y se mide con `/agent-eval` sobre los
cargos que escriben pruebas, antes y después.

**Ítem 3, caso propio.** Se recorre párrafo por párrafo con un criterio
escrito —qué es relato y qué es argumento—, el relato va a un archivo que no se carga y cada regla queda con su porqué
de una línea y el puntero. Se mide con `/agent-eval` sobre los cargos que más cayeron en R14, antes y después.

## Tradeoffs

- **Sacar texto de una regla cambia conducta, no sólo peso.** Es una quita escrita como limpieza (R9), y se prueba
  como tal: con evaluación, no con la suite. La medición del 2026-09-02 registró que un cambio de prosa en los cargos
  **sí** movió veredictos.
- **~~Lo que se mide no se toca mientras se mide (R22).~~ Era falso, y se corrigió el mismo día.** Esta línea decía
  que el ensamblaje del 2026-11-01 decide si bajó el 47 % de rojos que son R14 y que tocar `conduct.md` antes contaminaba
  esa medición. No hay tal medición: el ensamblaje sólo lee veredictos ya registrados (`agent-learning.yml:343`), ningún
  código calcula ese porcentaje, y `conduct.md` cambió cinco veces desde el 2026-09-02. El detalle está en el 441, que
  se aplazó por esta razón y se reabrió.
- **Las citas `rules/system/commits.md#R9` de las lecciones de cada instancia no se validan.** `engine/planning/lessons.js:36-42`
  las agrupa para contar correcciones repetidas: mover la doctrina de R9 a otro archivo parte ese conteo entre la cita
  vieja y la nueva, sin aviso. Lo tiene que resolver el caso del ítem 2.
- **Pruebas que se mueven**: la ventana de KB de `test/wiring/rules.test.js` con cualquier cambio de `system/`, y
  `test/planning/planning-template.test.js:73`, que fija el texto de R9, con el ítem 2.
- **El ahorro de los ítems 2 y 3 es estimación**: palabras contadas, pasadas a bytes y tokens con las proporciones de
  arriba y del caso 141. No es un número medido en una corrida.

## Contexto de descubrimiento

En la instancia de una empresa (Acme), con 0.114.0, al medir qué parte de las reglas se carga en cada sesión. La
instancia ya había movido sus propios relatos a un archivo que no se carga y declarado `aplica:` en sus reglas de PR,
entrega y evidencia. Después de eso, las tres reglas del sistema quedaron como el 43 % de lo que se carga siempre
(6.796 de 15.763 palabras).

Revisado el 2026-10-23 contra el fuente de este repositorio: los conteos se reprodujeron, la cifra de relato no —ver
«Síntoma»—, la causa se reescribió como la decisión que es, el ítem de R24 se descartó, y el caso se partió por riesgo.

## Relacionados

- Caso 141: el costo por agente de las reglas cargadas, y la equivalencia bytes-tokens.
- Caso 160: por qué R16, R20, R21 y R22 viven en `runs.md` —el contenido de la nota del ítem 1—.
- Caso 381: la medición de una regla nombrada con `aplica: al commitear`.
- Caso 234: una edición de `system/` que puso en rojo la ventana de KB.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («aplica las correcciones en el .md y arma el plan de
arreglo», y que vaya en la misma rama que el 437 y el 438). Mueve prosa de una regla del sistema, que es minor por sí
sola según el encabezado del CHANGELOG, y va en la misma versión que el 440.

La partición, ítem por ítem:

- **Ítem 1, la nota de `runs.md`: se hizo.** El párrafo pasó de `template/planning/rules/system/runs.md` a
  `template/planning/rules/README.md`, junto a la lista de qué regla vive en qué archivo, con su arranque reescrito —«Las
  de `system/runs.md` viven ahí»— porque el «Viven acá» original dejaba de decir de qué archivo hablaba, y una línea
  final que dice por qué vive en el README. El resto, sin cambiar.
- **Ítem 2, partir R9 con `aplica:`: le tocaba a otro y salió como caso propio**, el 440, con las tres decisiones que
  pide antes de construir.
- **Ítem 3, el relato: salió como caso propio**, el 441. Se lo aplazó hasta el ensamblaje del 2026-11-01 por una
  medición que no existe, y se reabrió el mismo día: ver «Tradeoffs» y el 441.
- **Ítem 4, fundir R24 en R14: se decidió que no**, con la razón en «Partición».
- **Tradeoffs.** Los de conducta y medición son de los ítems 2 y 3 y viajaron a sus casos. El de esta parte —la
  ventana de KB— se movió: `test/wiring/rules.test.js` fija ahora 51,x KB, con la entrada «caso 439» en la lista del
  comentario.

**Lo que se corrió para saber que funciona.**

- La prueba nueva de `test/wiring/rules.test.js`, «la nota de por qué una regla vive en su archivo no viaja en lo que
  carga cada agente», sobre una instancia instalada. Su primera versión buscaba la frase con `includes` y **pasaba con
  la nota todavía en `runs.md`**: la frase está partida en dos líneas por el ajuste a 120 columnas. Se rehízo con una
  expresión que tolera el salto, y ahí se vio en rojo por la razón correcta: `la nota sigue en una regla que se carga`,
  con `planning/rules/system/runs.md` en la lista. Con el párrafo movido, verde.
- La ventana de KB, en rojo antes de actualizarla, como está pensada.
- Mutación, en una copia del árbol: devolver `runs.md` a su versión de `HEAD` → `la nota sigue en una regla que se
  carga`.
- **Una instalación real**: `automation install . claude` en el banco `suelto` declaró `el bloque de reglas carga 5
  archivo(s), 51.8 KB en cada agente (0.0 KB propias)`, contra 52,3 antes. El bloque escrito en `CLAUDE.md` importa
  los cinco archivos de `system/` y no el README, y en la instancia `adoptadas` aparece 0 veces en `runs.md` y 1 en el
  README.
- `npm run ci`: exit 0, 1587/1587, con la cobertura en su piso.

**Pruebas reales antes de la versión**, a pedido del dueño el 2026-10-23 («corre todas las pruebas que se puede»).

- **Un `upgrade` real** de una instancia de 0.114.0 a esta versión, con el motor de `origin/main` y el de la rama
  congelados por `git archive`: sale en 0, y la nota de `runs.md` llega al README de reglas de la instancia, que no se
  carga. El detalle de los cuatro escenarios está en el 440.
