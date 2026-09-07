---
caso: 042
titulo: la tabla de acciones humanas se parte por todo `|` e ignora el escape de markdown
estado: resuelto
resuelto-en: 0.67.0
prioridad: alta
version-detectada: 0.66.0
---

# 042 — Un pipe escapado corre las columnas de `HUMAN_ACTIONS.md`

**🟢 resuelto en 0.67.0** · detectado en 0.66.0 · prioridad **alta** — la cara silenciosa le entrega al runner una acción que no es la de la fila

## Resumen

`readHumanActions` parte cada fila con `line.split('|')`. En markdown, un pipe dentro de una celda se
escribe `\|` —es la única forma, y así lo renderizan GitHub y cualquier visor—. El parser no conoce ese
escape, así que una celda que lo contiene se abre en dos y todas las columnas de esa fila se corren un
lugar.

El daño depende de en qué columna caiga el pipe, y la segunda cara es la que importa:

- **Ruidosa**: en `Tarea`, el estado real nunca se lee. La fila se rechaza nombrando una tarea partida al
  medio y culpando a la columna `Estado`, que está bien escrita.
- **Silenciosa**: en `Estado`, detrás de la palabra del vocabulario. La fila pasa `check` sin una queja y
  `ops context` le entrega al runner el contenido de `Origen` como si fuera la acción de desbloqueo.

Esa segunda es la que contradice lo que el propio molde promete de esta tabla: que la fila «es lo único
que hace que una persona se entere». Se entera de otra cosa.

## Reproducción

Desde un directorio vacío, con 0.66.0:

```bash
BANCO=~/.cache/sonda-042 && rm -rf "$BANCO" && mkdir -p "$BANCO" && cd "$BANCO"
npx @ingeniomaps/cauce@0.66.0 init . --mode embedded --force
```

**Cara ruidosa** — el pipe escapado en la columna `Tarea`:

```bash
cat > planning/HUMAN_ACTIONS.md <<'EOF'
# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| poner el flag `<COP\|USD>` en el .env | pendiente | Ready | Sembrar la variable. |
EOF
cauce check planning
```

**Cara silenciosa** — el pipe escapado en `Estado`, detrás de la palabra del vocabulario:

```bash
cat > planning/HUMAN_ACTIONS.md <<'EOF'
# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| sembrar-el-flag | pendiente — falta decidir `<COP\|USD>` | Ready | Sembrar `FLAG` en Infisical y avisar. |
EOF
cauce check planning
cauce context planning
```

*Verificado* el 2026-09-07 sobre 0.66.0.

## Síntoma

Cara ruidosa:

```
✗ HUMAN_ACTIONS poner el flag `<COP\: estado "USD>` en el .env" fuera de pendiente | resuelta; mientras no se entienda, la tarea queda bloqueada

1 error(es), 0 advertencia(s)
```

El error nombra `poner el flag \`<COP\` como tarea y `USD>\` en el .env"` como estado. Quien lo lee va a
tocar la columna `Estado`, que dice `pendiente` y está perfecta.

Cara silenciosa:

```
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)

HUMAN  sembrar-el-flag: Ready
```

`check` pasa y el runner recibe `Ready` —el contenido de `Origen`— como acción de desbloqueo. La
instrucción real, `Sembrar \`FLAG\` en Infisical y avisar.`, no llega a ningún lado.

## Causa raíz

`engine/planning/parser.js:292`:

```js
.map((line) => ({ line, cells: line.split('|').slice(1, -1).map((cell) => cell.trim()) }))
```

`split('|')` no distingue el separador de columna del pipe escapado que pertenece al texto. `cells[1]`
—de donde sale el estado, en `:295`— y `cells[3]` —de donde sale la acción que consume `ops context`—
quedan corridos.

`cells.length >= 4` en `:293` es lo que hace que la cara silenciosa no se note: con las columnas
corridas la fila sigue teniendo cuatro o más celdas, así que pasa el filtro y se lee entera, mal.

## Fix propuesto

Partir respetando el escape, que es un mirar-atrás y nada más:

```diff
-.map((line) => ({ line, cells: line.split('|').slice(1, -1).map((cell) => cell.trim()) }))
+// El pipe escapado `\|` es parte del texto de la celda, no un separador: es la única forma que da
+// markdown de escribir un pipe en una tabla, y sin esto las columnas de esa fila se corren un lugar.
+.map((line) => ({ line, cells: line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim()) }))
```

Queda por decidir si el `\` se conserva o se quita al normalizar la celda. Conservarlo es lo más barato
y no molesta a ningún consumidor de hoy; quitarlo haría que `ops context` imprima el texto como se lee,
que es a quién sirve esa columna.

## Tradeoffs

Ninguno visible. Una fila que hoy se lee bien tiene sus pipes como separadores y ninguno escapado, así
que el nuevo `split` la parte idéntico. Lo único que cambia de comportamiento son las filas que hoy se
leen mal.

Sí aparece un efecto de borde deseable: un archivo que venía pasando `check` con una fila corrida puede
empezar a fallar cuando el estado real que quedaba oculto no sea del vocabulario. Eso es el defecto
saliendo a la luz, no una regresión.

## Prioridad

**Alta.** La cara silenciosa no deja rastro, pasa `check` y corrompe justo el campo cuyo propósito es
decirle a una persona qué hacer para desbloquear. Y no se llega por un camino rebuscado: escribir un
pipe en una celda —una alternativa `A|B`, un `grep … | …`, un tipo de unión— es corriente, y quien lo
escriba bien, escapándolo, es exactamente quien lo dispara.

## Contexto de descubrimiento

Migrando `roax-ops` —un sistema de planning hecho a mano, anterior a Cauce— a una instancia de 0.66.0,
el 2026-09-07. Su `HUMAN_ACTIONS.md` tiene 86 filas de datos con prosa larga, y para normalizar los
estados al vocabulario cerrado hubo que escribir el `split` con mirar-atrás: partir por todo `|` rompía
las filas. Al comparar las dos formas de partir contra el archivo real dieron el mismo resultado en las
86 —el único `\|` vivía en la columna 4, pasada la última que el parser mira—, así que ahí no mordió.
La sonda de arriba es la que lo aisló.

## Cierre

**Resuelto en 0.67.0.** El recorrido de lo que enumeró, ítem por ítem:

- **El `split` que respeta el escape — hecho**, tal cual el diff propuesto: `line.split(/(?<!\\)\|/)`.
- **La decisión que el caso dejaba abierta —conservar o quitar el `\`— tomada: se quita.** La razón es
  para quién existe esa columna: una persona lee ahí qué tiene que hacer, y `\|` no es parte de lo que
  el autor quiso decir, es cómo markdown escribe un pipe. Comprobado que no rompe el otro consumidor:
  `archive` reescribe la fila desde `row.raw` —la línea original— en `engine/cli/planning.js:360`, no
  desde las celdas, así que la fila archivada conserva su escape.
- **Las dos caras que el caso separa — cada una con su aserción.** La ruidosa: el pipe en `Tarea` y la
  fila bien escrita ya no se rechaza. La silenciosa: el pipe en `Estado` detrás de la palabra del
  vocabulario, y la acción de desbloqueo que llega es la de la fila y no el contenido de `Origen`.
- **«Tradeoffs: ninguno visible» — se sostiene.** `npm run ci` en verde, 555 pruebas. Una fila que hoy
  se lee bien no tiene pipes escapados, así que el nuevo `split` la parte idéntico; hay una aserción que
  lo fija con una fila normal.
- **La predicción del mismo Tradeoffs —«un archivo que venía pasando `check` puede empezar a fallar»—
  estaba sin comprobar y ahora está comprobada.** Con el pipe escapado en `Tarea`, `pendiente` caía en la
  posición del estado y la fila pasaba; leída bien, el estado es `hecho`, fuera del vocabulario. O sea
  que antes desbloqueaba una tarea que nadie resolvió. Va en su propia prueba a propósito: junta con las
  otras, la primera aserción falla antes y ésta no se ejercería nunca.
- **Lo que el arreglo no cubre y el caso no preveía**: una celda que termine en una barra invertida
  literal. En markdown eso se escribe `\\` y acá se leería como escape del separador. Es un borde que
  nadie escribe y taparlo pedía un parser de verdad; queda dicho en el código en vez de supuesto.
- **El orden con [043](043-la-cabecera-de-acciones-humanas-solo-se-saltea-si-dice-tarea.md) — corregido.**
  Los dos casos decían que el segundo en entrar no aplicaría tal cual. Con 042 puesto resulta falso: lo
  único que cambió es la línea del `.map`, y el diff de 043 toca el `read` y el `.filter`, que quedaron
  igual. Sigue aplicando literal.

Las dos piezas se vieron rojas antes de arreglarse: quitar el mirar-atrás rompe las dos pruebas, cada
una por su lado, y quitar el desescape rompe la primera.

## Relacionados

- [043](043-la-cabecera-de-acciones-humanas-solo-se-saltea-si-dice-tarea.md) — mismo parser, misma
  función; salió de la misma migración. **Éste va primero**: los dos diffs reescriben líneas contiguas
  del mismo encadenado —el `.filter` y el `.map` de `readHumanActions`—, así que el segundo en entrar
  no aplica tal cual y hay que releer la función. Éste es `alta` y aquél `baja`, así que el orden que
  menos vueltas da es 042 → 043.
- [019](019-los-campos-de-done-se-leen-de-una-sola-linea.md) — la otra vez que un contrato de planning
  se leyó con una partición más simple que el formato que acepta.
