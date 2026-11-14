---
caso: 500
titulo: Una propuesta que el agente ya marcó aplicada se sella sin entrada en el CHANGELOG, y nada avisa
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 500 — Una propuesta que el agente ya marcó aplicada se sella sin entrada en el CHANGELOG, y nada avisa

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: pasó en 2 de 9 promote del 2026-11-12, cada mes puede
repetirse, y la entrada falta en la versión que se publica sin que ninguna salida lo diga.

## Resumen

En `agent-promote`, el agente del paso «Aplicar» puede escribir él mismo `status: applied` y «- Estado: aplicada» en la
propuesta: el prompt no se lo prohíbe. Cuando después corre `ops learn <cargo> --applied`, `seal` encuentra el documento
ya sellado, devuelve `already` y **no anota el cambio en el CHANGELOG**. El CLI imprime `= … ya estaba aplicada` con exit
0, el workflow sigue, y el cargo sale en la release sin entrada.

## Reproducción

Sin modelo, sobre dos copias desechables del árbol de `9584803a` (antes de aplicar la tanda 5) y la propuesta 2026-11 de
`ux-designer`, que en ese commit está `status: proposed` / «- Estado: aprobada»:

```bash
S=$(mktemp -d)
mkdir "$S/A" "$S/B"
for x in A B; do git archive 9584803a | tar -x -C "$S/$x"; done
P=agents/roles/system/ux-designer/learning/proposals/2026-11.md
# B: lo que hizo el agente de «Aplicar» en release-manager y ux-designer
sed -i 's/^status: proposed$/status: applied/; s/^- Estado: aprobada$/- Estado: aplicada/' "$S/B/$P"
for x in A B; do
  echo "== $x: $(grep -m1 '^status' $S/$x/$P) / $(grep -m1 '^- Estado' $S/$x/$P)"
  cp "$S/$x/CHANGELOG.md" "$S/$x.before"
  (cd "$S/$x" && node engine/cli/ops.js learn ux-designer --applied --period 2026-11; echo "exit=$?")
  echo "CHANGELOG ux nuevas: $(diff "$S/$x.before" "$S/$x/CHANGELOG.md" | grep -c ux-designer)"
done
```

## Síntoma

Corrido el 2026-11-12:

```
== A: status: proposed / - Estado: aprobada
✓ agents/roles/system/ux-designer/learning/proposals/2026-11.md queda aplicada: no se vuelve a aplicar
✓ CHANGELOG.md: el cambio sale en 0.120.0
exit=0
CHANGELOG ux nuevas: 1
== B: status: applied / - Estado: aplicada
= agents/roles/system/ux-designer/learning/proposals/2026-11.md ya estaba aplicada
exit=0
CHANGELOG ux nuevas: 0
```

Y en las corridas reales del 2026-11-12, el paso «sella» de cada workflow devolvió, según su `journal.jsonl`:

- `release-manager` y `ux-designer`: `"= …/2026-11.md ya estaba aplicada\n(exit=0)"`. Antes, el agente de «historial»
  respondió «No agregué nada: la fila ya está», porque la había escrito el de «Aplicar».
- `backend-engineer`, cuyo agente no tocó el estado: `"✓ … queda aplicada … ✓ CHANGELOG.md: el cambio sale en 0.120.0"`.

## Causa raíz

Dos, encadenadas:

1. `automatization/workflows/agent-promote.js:129-167`: el prompt de «Aplicar» le da reglas sobre qué agregar, los casos
   y las desviaciones, pero no le dice que el frontmatter, el «Estado» y `learning/HISTORY.md` no son suyos. Dos de nueve
   agentes los tocaron. El comentario de `engine/agents/learning-seal.js:38-41` ya registra que «mover `status` se le
   parece a su trabajo» (`growth-marketer/2026-09`).
2. `engine/agents/learning-seal.js:42`: `if (state === 'applied' && !UNSEALED.test(text)) return { file, already: true }`
   sale antes de llegar a `changelog.noteAgentChange` (`learning-seal.js:74-78`). La guarda que se agregó por
   `growth-marketer` mira el cuerpo además del frontmatter, así que la atrapa sólo si el agente movió uno de los dos;
   moviendo los dos, el documento ya se lee sellado. `engine/cli/catalog.js:109-111` imprime `= … ya estaba aplicada` con
   exit 0, que se lee como éxito.

## Fix propuesto

- En `seal`, cuando el documento ya está aplicado, anotar igual el CHANGELOG si es `kind: 'agent'`, `note` y modo
  toolkit. `noteAgentChange` ya distingue la entrada existente —`catalog.js:112-115` imprime
  `= CHANGELOG.md ya nombraba este cambio`—, así que repetir el sello sigue siendo idempotente. Ésta es la parte que cierra
  el hueco aunque un agente vuelva a desobedecer.
- En el prompt de «Aplicar», una línea: no tocar el frontmatter, el «Estado» ni `learning/HISTORY.md`, que los escriben
  el paso «historial» y el sello. Baja la frecuencia, pero sola no alcanza, porque es una instrucción a un modelo.

## Tradeoffs

- Volver a sellar a mano una propuesta vieja agregaría una entrada a la versión abierta por un cambio que ya salió. Hoy
  `noteAgentChange` sólo evita duplicar dentro de la versión abierta (`engine/core/changelog.js:76-81`): si no hay
  versión abierta, abre una nueva (`changelog.js:65-71`) sin mirar las publicadas. El arreglo tiene que buscar la
  pareja cargo y propuesta en todo el CHANGELOG, o cambia un error de omisión por uno de duplicado.
- Quién depende de la salida temprana: `test/agents/learning-proposal.test.js` prueba la rama `already` de `seal`, y
  `catalog.js:109-111` imprime según ella. Las dos se revisan con el arreglo.
- La línea del prompt cambia lo que el agente de «Aplicar» hace, y eso es una quita (R29): hay que comparar lo que
  escribe antes y después sobre el mismo caso.

## Contexto de descubrimiento

Al aplicar la tanda 5-7 de 2026-11 (PR #986), las entradas de `release-manager` y `ux-designer` no aparecieron en la
versión 0.120.0, y se escribieron a mano. Al cerrar la tanda, `main` tiene entrada para las 35 propuestas aplicadas de
2026-11, pero sólo por esas dos escritas a mano. En las tandas 1-4 no hay forma de saber si pasó: todas sus entradas se
reescribieron a mano por el 497, y una que faltara se habría completado sin dejar rastro.

## Relacionados

- 497: la entrada que sí se escribe no dice qué cambió. Mismo destino y distinto defecto: aquel es el texto, éste es
  que la entrada no existe.

## Cierre

`seal` anota el CHANGELOG también cuando encuentra la propuesta ya sellada, siempre que el sello no esté todavía en
`HEAD`: es la forma en que el agente de «Aplicar» la deja dentro de la misma corrida, antes del commit. Si `HEAD` ya la
tiene sellada, es de otro ciclo y no se anota. `noteAgentChange` busca la pareja cargo y propuesta en todo el archivo,
con las dos marcas en la misma viñeta. Y el prompt de «Aplicar» dice que el frontmatter, el «Estado» y `HISTORY.md` no
son de quien aplica.

Línea de base: la reproducción del caso, con el motor de la rama, sobre dos copias de `9584803a`. La copia A se anotó y
la B, que el agente había sellado, no: «CHANGELOG ux nuevas: 0».

Contra el caso:

- **Fix 1, anotar en `seal` aunque esté aplicado:** se hizo, y se le agregó la condición de `HEAD`. Sin ella, volver a
  sellar a mano una propuesta vieja metía su cambio en la versión abierta. Lo encontró la revisión independiente:
  sobre una copia, `learn ui-designer --applied --period 2026-08` agregó a 0.120.0 un cambio de agosto. De las 117
  propuestas aplicadas, 35 no tienen entrada, porque son anteriores a la anotación automática.
- **Fix 2, la línea del prompt:** se hizo.
- **Tradeoff, buscar la pareja en todo el CHANGELOG:** se hizo, en la misma viñeta. Buscarla en toda la versión daba
  por anotada una propuesta cuando el cargo y el nombre estaban en viñetas distintas; con la búsqueda en todo el
  archivo, ese falso positivo alcanzaba a todas las versiones.
- **Tradeoff, quién depende de la salida temprana:** las pruebas de `learning-proposal.test.js` siguen en verde, y
  `catalog.js` imprime las dos líneas, «ya estaba aplicada» y la del CHANGELOG, sin cambios.
- **Tradeoff, la línea del prompt es una quita (R29):** comparado antes y después sobre el mismo caso, abajo.

Lo que el caso no preveía: el prompt de «Aplicar» le decía a quien aplica que lo que escribe, «propuesta, historial,
caso», viaja con el cargo, y eso le sugería que el historial era suyo. Se sacó «historial» de esa lista.

### Lista de cierre

1. hecho: la reproducción del caso con el motor de la rama, antes del cambio (arriba).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: las pruebas de `learning-changelog.test.js` y `core.test.js` en rojo antes del cambio («y el cambio no se
   anotó») y en verde después.
4. hecho: ocho mutaciones, todas en rojo: no anotar en la salida temprana; buscar sólo en la primera versión; buscar
   sin partir en viñetas; dar por sellada toda propuesta que esté en `HEAD`; ignorar «En una línea»; y sacar del molde,
   del prompt de componer y del de aplicar sus líneas nuevas. Dos sobrevivieron al principio, la de la primera versión
   y la de `HEAD`, y se les sumó el caso.
5. hecho: el prompt de «Aplicar», antes y después, sobre la misma propuesta firmada de backend-engineer 2026-11, con
   `claude -p` y Sonnet. Antes, en la corrida «sin fixture» del 501, el agente pasó el «Estado» a «aplicada» y escribió
   `HISTORY.md`. Después, en dos corridas, no tocó el frontmatter, el «Estado» ni `HISTORY.md`. La segunda corrió sobre
   el texto final del prompt.
6. hecho: la reproducción del caso con el motor nuevo. B se anota («✓ CHANGELOG.md: el cambio sale en 0.120.0»), y
   sellarla otra vez dice «= CHANGELOG.md ya nombraba este cambio en 0.120.0» sin agregar nada.
7. hecho: lo que depende de un modelo, el prompt de «Aplicar», corrió con uno (punto 5). USD 0,39 entre las dos.
8. hecho: corrieron el CLI, el motor con y sin git, con la propuesta sellada en `HEAD` y sólo en el árbol, y la búsqueda
   en una versión publicada que no es la última. No corrió un `agent-promote` entero, de punta a punta.
9. hecho: dos cargos con la misma propuesta en el CHANGELOG, y dos versiones.
10. hecho: llaman a `seal` el CLI (`catalog.js`) y `agent-promote`, que no llega con una ya aplicada porque se detiene
    en `ya-aplicada`. `agent-learning.yml` no sella.
11. hecho: tres pasadas independientes. La primera encontró las dos regresiones de arriba (impedían entregar) y cuatro
    menores, arreglados salvo el pedido del prompt de componer con `cambia: no`, que no rompe nada porque esa propuesta
    se archiva sola. La segunda, que ninguna prueba cubría el caso con git y la propuesta sin sellar en `HEAD` (impedía
    entregar), y tres menores, arreglados. La tercera, una línea de 125 caracteres, arreglada. Quedan anotados dos bordes
    de las viñetas que el motor no escribe: una línea en blanco dentro de una viñeta, y una subviñeta de otro cargo. Y
    uno de `HEAD`: si alguien commitea la propuesta que el agente selló antes de que corra el sello, no se anota.
12. hecho: pasada uno por uno. Se corrigieron un comentario que afirmaba que la línea del prompt baja la frecuencia, y
    otro que decía «normalizados» donde el código sólo saca la sangría.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con el 497.

**Sin probar:** un `agent-promote` entero de punta a punta, con el sello real después de «Aplicar».
