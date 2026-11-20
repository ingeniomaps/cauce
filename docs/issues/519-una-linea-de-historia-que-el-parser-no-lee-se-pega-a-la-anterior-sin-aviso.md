---
caso: 519
titulo: una línea de historia que el parser no lee se pega a la anterior sin aviso
estado: resuelto
resuelto-en: 0.123.1
prioridad: baja
version-detectada: 0.123.0
---

# 519 — `* [~] **slug**` en «Historias» no es historia ni aviso: se pega a la anterior y la épica pasa sin evidencia

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **baja**.

**Prioridad baja**: el origen fue una casilla que la instancia inventó (`[~]`, para una historia cancelada) y que la
gramática de Cauce nunca prometió. Lo que falta en Cauce es el aviso, no un cambio de gramática. Sube a media si una
historia pendiente desaparece así de una épica que se cierra.

## Resumen

En «Historias», la gramática de una historia es `- **slug** …` o `* **slug** …`, con una casilla `[ ]`/`[x]`
opcional y sin significado: lo hecho se lee de `done/<slug>.md`. Una línea con otra casilla —`[~]`, `[-]`, `[ x]`—
no casa con el patrón, y el cuerpo no ávido de la historia anterior la absorbe como texto. Son dos daños:

1. La historia desaparece: no cuenta para cubrir criterios ni para la evidencia de una épica `closed`, y `ops check`
   no dice nada.
2. La anterior hereda sus referencias: los `(→ CN)` de la línea absorbida pasan a ser de la historia de arriba, y
   `check` le reclama a su `done/` un criterio que no cubre («la historia cita C2 y tests: no lo rastrea»).

## Reproducción

Desde la raíz de Cauce, en el banco de medición (revisado el 2026-11-19 sobre `27bbf5e5`, 0.123.0):

```bash
B=$(node engine/cli/ops.js bench suelto --force) && cd "$B"
cat > planning/roadmap/epic-001-demo.md <<'EOF'
---
epic: 001
title: Demo
status: closed
service: app
---

# Épica 001 — Demo

## Resultado

Algo.

## Fuera de alcance

- Nada.

## Criterios

- **C1** — Cuando a, b obtiene c.
- **C2** — Cuando d, e obtiene f.

## Contexto relevante

- app/

## Historias

- [x] **historia-a** (→ C1) — Uno. _Aceptación: x._ (service: app)
- [x] **historia-b** (→ C1) — Dos. _Aceptación: y._ (service: app)
* [~] **historia-c** (→ C2) — Tres, cancelada. _Aceptación: z._ (service: app)

## Riesgos y decisiones humanas

- Ninguno
EOF
# done/ para historia-a e historia-b, ninguno para historia-c
for s in a b; do printf -- '- [x] **historia-%s** (epic: 001) — Historia %s\n  acept: x\n  fecha: 2026-11-19\n  done: cambios\n  qa: visto\n  tests: C1 → comando\n  decisions: ninguna [supuesto: banco]\n  commit: abc1234 feat(app): demo (app@main)\n  lane: express\n  review: aprobado por tech-lead, sobre app/x\n' $s $s > planning/done/historia-$s.md; done
node tools/ops.js check planning | grep -E '✗'                          # con [~]
sed -i 's/^\* \[~\] \*\*historia-c/* [ ] **historia-c/' planning/roadmap/epic-001-demo.md
node tools/ops.js check planning | grep -E '✗'                          # con [ ]
```

## Síntoma

```
# con [~]  (exit 1)
✗ done/historia-b.md historia-b: la historia cita C2 y tests: no lo rastrea
# con [ ]  (exit 1)
✗ roadmap/epic-001-demo.md: closed sin evidencia para historia-c
```

Con `[~]` los dos daños a la vez: el error de evidencia de `historia-c` desaparece, y `historia-b`, que sólo declara
`C1`, aparece citando `C2` —que además cuenta como cubierto por ella—. Leída con el parser, la épica no tiene
`historia-c`, y `historia-b` trae su texto adentro:

```
[ 'historia-a', 'historia-b' ] true      # slugs leídos; JSON de historia-b incluye «historia-c»
```

En la instancia donde apareció pasó lo mismo con una épica `closed` real, sobre una copia hecha para la prueba.

## Causa raíz

`engine/planning/parser.js:117-120` (0.123.0, contrastado):

```js
const storyPattern = new RegExp(
  String.raw`^[-*]\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*\s+([\s\S]*?)` +
    String.raw`(?=\n[-*]\s+(?:\[[ xX]\]\s+)?\*\*|\n##|(?![\s\S]))`,
```

El cuerpo `([\s\S]*?)` corta sólo antes de otra viñeta con la misma forma. `* [~] **slug**` no la tiene, así que no
abre historia y tampoco corta la anterior. Después, `engine/planning/contracts.js:72-85` cubre criterios y pide
evidencia sólo sobre `epic.stories`: lo que el parser no tomó no existe para ninguno de los dos.

El criterio que Cauce aplica en casos vecinos es avisar lo que se escribió y no se lee: un encabezado con forma de
regla que `check` no reconoce (`engine/planning/structure.js:150`, `RULE_LIKE`, caso 224) y dos secciones «Historias»
o «Criterios» que compiten (`competingSections`, `structure.js:126-145`: «sólo se lee la primera y el resto se ignora
entero»). Una línea con forma de historia que no se lee no tiene ese aviso.

## Fix propuesto

Un aviso en `check`, junto a `competingSections`, para la línea de «Historias» que empieza como viñeta con algo entre
corchetes seguido de `**slug**` (`^[-*]\s+\[[^\]]*\]\s+\*\*`) y no casa con `storyPattern`: «parece una historia y no
se lee; la casilla es `[ ]` o `[x]`». Vale para cualquier estado de la épica, no sólo `closed`: el daño 2 aparece
también en una abierta. Es una propuesta, no una decisión. Si se quiere además un modo de decir «cancelada», es otro
caso: hoy la salida es sacar la historia y dejarla en las notas de la épica.

El aviso no arregla el daño 2 por sí solo: mientras la línea esté, la historia de arriba sigue heredando sus `(→ CN)`.
Como el aviso dice qué corregir, alcanza; cortar el cuerpo en cualquier viñeta de columna 0 lo resolvería sin la
corrección, pero cambia lo que el parser lee y queda fuera de este caso.

## Tradeoffs

- Un aviso y no un error: la casilla no tiene significado en la gramática, y una línea así puede ser prosa a
  propósito. El error vendría de los chequeos que ya existen, una vez que la línea se lee. Un aviso nuevo tampoco
  rompe el formato de `planning/` según `docs/public-api.md` (§3).
- No cubre una historia escrita sin `**` en el slug: ésa ya no tiene forma de historia, y el caso es la casilla.
- Quién más lee «Historias»: `engine/integrations/registry.js:400-424` escribe y busca la sección al promover y
  `engine/planning/epic-milestones.js` reparte sus slugs en hitos; ninguno cambia con un aviso. Cómo se comprueba que
  no retrocede: las épicas de los fixtures y de `template/planning` siguen sin avisos (`npm run ci`).

## Contexto de descubrimiento

Una instancia real, 2026-11-16, auditoría de épicas. Para marcar historias descartadas se usó `[~]`, siguiendo una
épica que lo traía desde agosto para una historia cancelada por decisión de negocio. `ops check` empezó a atribuirle
a una historia el criterio de la `[~]` siguiente («la historia cita C2») y, al revisar por qué, se vio que una épica
cerrada pasaba sin la evidencia de su historia cancelada. La instancia ya sacó esas historias de sus épicas y las
dejó en «Notas».

## Revisión (2026-11-19)

- Citas contrastadas: `parser.js:117-120`, `contracts.js:72-85` y `structure.js:126-145` coinciden con el fuente;
  `RULE_LIKE` está en `structure.js:150`.
- Reproducido en el banco `suelto` con la salida de arriba. La reproducción original corría sobre la instancia y no
  servía desde un directorio vacío; se reemplazó.
- Se agregó el daño 2, que el caso contaba en su contexto y no en el resumen, y que el fix no cierra solo.
- Prioridad baja confirmada: hay salida (corregir la casilla) en cuanto alguien sabe que existe, y la gramática
  documentada nunca prometió otra casilla.

## Relacionados

- **224** — un encabezado con forma de regla que `check` no lee: el mismo criterio de avisar lo que no se lee.

## Cierre

`unreadStories` (`engine/planning/structure.js`), junto a `competingSections` y cableado en `check`
(`engine/cli/validate.js`), avisa cada viñeta de «Historias» con forma de historia y otra casilla que `[ ]`/`[x]`,
nombrando la línea y el slug que no cuenta. Recorre las épicas con el mismo `epicFiles` que el parser —también la
graduada, `roadmap/epic-NNN-slug/spec.md`— y sin la plantilla, igual que `readEpics`. El parser no cambió.

Línea de base: la reproducción de arriba, en el banco `suelto`, con el motor de antes del cambio.

Contra el caso:

- **Fix, el aviso:** se hizo, con el patrón del caso cerrado a lo que el parser no lee: la casilla `[ ]`, `[x]` o `[X]`
  no avisa, y lo de fuera de «Historias» tampoco (se lee con `P.section`, igual que el parser).
- **Fix, para cualquier estado de la épica:** se hizo; avisa también en una abierta.
- **Fix, el daño 2 no se arregla solo:** queda como decía: mientras la línea esté, la historia de arriba hereda sus
  `(→ CN)`; el aviso dice qué corregir.
- **Fix, un modo de decir «cancelada»:** se decidió que no en este caso; la salida sigue siendo sacarla a las notas, y
  el CHANGELOG lo dice.
- **Tradeoff, aviso y no error:** se hizo así; no rompe la API pública §3.
- **Tradeoff, sin `**` en el slug:** no se cubre, como decía.
- **Tradeoff, quién más lee «Historias»:** `registry.js` y `epic-milestones.js` no cambian; las épicas de
  `template/planning` y de los fixtures siguen sin avisos (`npm run ci`).

Lo que el caso no preveía: la primera versión recorría `roadmap/` con su propio filtro y no veía las épicas graduadas,
que el parser lee por su `spec.md`; la revisión independiente lo midió y ahora usa `epicFiles`. Su vecino
`competingSections` (`structure.js:126`) tiene ese mismo recorrido, desde antes, y queda anotado acá. Tampoco tenía una
prueba que lo viera a través de `check`; la de éste sí la tiene, porque la mutación que lo descablea sobrevivía sin ella.

Quedan como están, anotadas por la revisión, otras formas que el parser no lee y que no son la casilla: `**b**(→ C2)`
sin espacio después del slug —se pierde entera, sin pegarse a nada—, un `*` dentro del slug, `[x]**b**` sin espacio,
la viñeta con sangría o con `+`, y `<!-- - [~] **b** -->` en una línea, porque `readEpics` no quita los comentarios. Y
el mensaje nombra `[ ]` y `[x]`, aunque `[X]` y la viñeta sin casilla también se leen.

### Qué se corrió

`ops check` en el banco `suelto`, con la épica de la reproducción (antes → después):

```
# con [~]
(nada)                                                     ⚠ roadmap/epic-001-demo.md: «* [~] **historia-c**» parece una
                                                             historia y no se lee; la casilla es [ ] o [x], y
                                                             `historia-c` no cuenta hasta que la tenga
✗ done/historia-b.md historia-b: la historia cita C2 …      ✗ (igual)
# con [ ]
✗ roadmap/epic-001-demo.md: closed sin evidencia para …    ✗ (igual, sin aviso)
```

Mutaciones, en una copia, todas rojas en `test/planning/contracts.test.js`: avisar toda casilla; leer el archivo
entero y no sólo «Historias»; sacar el aviso de `check`; recorrer `roadmap/` sin `epicFiles`; no saltear
`status: template`; y no saltear `epic: 000`.

**Sin probar:** nada.

### Lista de cierre

1. hecho: la salida de `check` en el banco con el motor de antes, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: las tres pruebas nuevas, rojas sin la función, sin el cableado y con el recorrido propio, y verdes con el
   cambio.
4. hecho: seis mutaciones en una copia, todas rojas; la del cableado y las del filtro de plantilla sobrevivían, y por
   eso se sumaron la prueba por `check` y una prueba aparte con las épicas que el parser lee y las que saltea.
5. no aplica: no quita ni reemplaza nada; suma un aviso.
6. hecho: `ops check` en un banco, sin dobles.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: corrieron las pruebas de `contracts`, `check` en el banco con `[~]` y con `[ ]`, y `init` + `check --json`.
9. no aplica: no coordina nada.
10. hecho: el parser y sus lectores no cambian; `check` suma un aviso, que `--json` ya devuelve en `warnings`.
11. hecho: tres pasadas independientes. La primera encontró que no veía las épicas graduadas; la segunda, dos líneas
    largas y un borrado recursivo en la prueba que la puerta iba a frenar, y una rama sin prueba; la tercera, nada que
    impida entregar, y su nota sobre el título de una prueba se corrigió.
12. hecho: uno por uno sobre el diff final; el encabezado de la prueba repetía la razón del código (0,30 con el
    tokenizador) y pasó a decir sólo qué se mide.
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.

