---
caso: 203
titulo: Las viñetas de «### Límites» viajan dos veces si la primera empieza con «El runner», «Debe» o «Nunca»
estado: resuelto
resuelto-en: 0.99.2
prioridad: media
version-detectada: 0.98.0
---

# 203 — La lista de límites se manda entera una segunda vez, pegada en un solo límite

**🟢 resuelto en 0.99.2** · detectado en 0.98.0, reproducido en 0.99.1 · prioridad **media**.

**Prioridad media**: no rompe nada ni pierde un límite, pero cobra en cada subagente y no se ve. En la
instancia donde apareció, la copia eran 2.929 de los 6.991 caracteres de límites del preámbulo: un 42 %
de más, en cada agente de cada corrida. Sube a alta si el preámbulo tiene un tope y la copia empuja
afuera algo que sí tenía que llegar.

## Resumen

`limits()` junta las viñetas de `### Límites` y, además, todo párrafo que empiece con `El runner`, `Debe` o
`Nunca`. Las viñetas de un bloque van sin líneas en blanco entre sí, así que para la segunda pasada son
**un solo párrafo**. Si la primera viñeta empieza con una de esas palabras, el bloque entero entra otra vez
como un límite más: cada límite llega dos veces, una suelto y otra dentro de una frase que los pega a todos.

Es justo la gramática que el propio contrato enseña a usar, así que el caso normal es el que falla.

## Reproducción

```sh
mkdir demo && cd demo
node <cauce>/engine/cli/ops.js init . --name demo
```

Bajo `### Límites` de `organization/workspace.md`, debajo del ejemplo comentado, agregar:

```markdown
- El runner no toca migraciones en `api/` sin aprobación de quien administra la base.
- Nunca publica en `main`.
```

```sh
node <cauce>/engine/cli/ops.js contract . --json    # mirar los últimos elementos de `boundaries`
```

Y después cambiar la primera viñeta a `- En \`api/\` el runner no toca migraciones sin aprobación…` y volver
a correrlo.

## Síntoma

Últimos elementos de `boundaries`, primera viñeta con «El runner…»:

```
· El runner no toca migraciones en `api/` sin aprobación de quien administra la base.
· Nunca publica en `main`.
· El runner no toca migraciones en `api/` sin aprobación de quien administra la base. Nunca publica en `main`.
```

La misma lista con la primera viñeta empezando con «En `api/`…»:

```
· En `api/` el runner no toca migraciones sin aprobación de quien administra la base.
· Nunca publica en `main`.
```

`ops check` no avisa nada en ninguno de los dos casos: `warnings()` busca lo que **falta**, y esto sobra.

## Causa raíz

`engine/cli/contract.js:124-133`, `limits()`:

```js
const prose = text.split(/\n\s*\n/)            // un bloque de viñetas seguidas es un solo párrafo
  .map((block) => block.split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    …
    .join(' ')                                  // las viñetas quedan pegadas en una frase
  .filter((block) => ENUNCIA.test(block))       // y entra si la primera empieza con la gramática
return [...declared(text), ...prose]            // declared() ya las había traído una por una
```

La pasada de prosa no descuenta las líneas que ya declaró `marked()`. `warnings()` sí lo hace (usa `own`
para eso, caso 159); `limits()` no.

## Fix propuesto

Que la pasada de prosa descarte las líneas que `marked()` ya tomó como viñetas, igual que `warnings()`:

```diff
 function limits(text) {
+  const { bullets, own } = marked(text)
+  const taken = new Set(own)
   const prose = text.split(/\n\s*\n/)
     .map((block) => block.split('\n')
       .map((line) => line.replace(/^[-*]\s+/, '').trim())
-      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|'))
+      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|') && !taken.has(line))
       .join(' ')
       .trim())
     .filter((block) => ENUNCIA.test(block))
-  return [...declared(text), ...prose]
+  return [...bullets, ...prose]
 }
```

**Probado sobre una copia del motor** (2026-09-28, banco `suelto`, `ops contract . --json`), y cierra la
reproducción: el banco sin cambios da 3 elementos en `boundaries`; con las dos viñetas agregadas, `main` da
6 —la sexta es la lista pegada— y el fix da 5, sin la copia. Lo mismo con la primera viñeta partida en dos
líneas (caso 168): `main` 6, fix 5. Con las viñetas sangradas (`  - El runner…`) el fix tampoco duplica,
pero por casualidad: `limits()` no les saca el `- ` y el bloque ya no empieza con `ENUNCIA`.

La prueba que le falta es la de la reproducción, con las dos órdenes de viñetas y la de varias líneas,
afirmando que ningún elemento de `boundaries` contiene a otro. La mutación: devolver `declared(text)` en vez
de `bullets` y quitar el filtro `taken` tiene que ponerla roja.

## Tradeoffs

- Un párrafo en prosa que repita palabra por palabra una viñeta dejaría de contarse. Es lo correcto: es el
  mismo límite.
- Con el arreglo, el borde queda en `own`: si su normalización se aparta de la de `limits()` (espacios,
  el `- ` inicial), vuelve a duplicar. Conviene que las dos salgan de la misma función.

## Contexto de descubrimiento

`ops check` avisaba en una instancia en modo `sidecar` que 14 párrafos de «Excepciones de autonomía» no
llegaban a los agentes. Al revisarlo con `ops contract` apareció lo contrario: los límites llegaban todos y
la lista entera llegaba dos veces, porque la primera viñeta empezaba con «El runner». La instancia lo
esquivó dándole otro orden de palabras a esa viñeta y dejando un comentario que lo explica. Es un
parche frágil: el primero que reordene la lista lo vuelve a romper.

## Lo que apareció al correrlo y no es este caso

Una lista de viñetas **fuera** de `### Límites`, directo bajo «Excepciones de autonomía», con la gramática
vieja:

```markdown
- El runner no despliega.
- Nunca borra ramas.
```

llega como **un** límite: `· El runner no despliega. Nunca borra ramas.` Pasa igual en `main` y con el fix,
porque el fix sólo descuenta lo que `marked()` tomó, y `marked()` sólo mira `### Límites`. No se duplica
nada y los dos límites llegan, pegados. Es el comportamiento de siempre del camino viejo —para él una lista
es un párrafo— y el 157 existe justo para no tener que usarlo; si vale un caso propio es una decisión, no
algo que este arreglo deba tocar.

## Relacionados

- 157: el que introdujo `### Límites` como camino declarado.
- 159: el mismo descuento por línea, hecho en `warnings()` y no en `limits()`.
- 168: el plegado de viñetas de varias líneas.

## Cierre

**Resuelto en 0.99.2 por el fix propuesto, tal cual.** Recorriendo lo que el caso enumeró:

- **Fix propuesto → se hizo.** `limits()` descuenta las líneas que `marked()` ya tomó como viñetas y
  devuelve sus `bullets` (`engine/cli/contract.js`). `declared()` se quitó: sin él no lo llamaba nadie.
- **La prueba que le faltaba → se hizo**, con las tres listas del caso —primera viñeta con «El runner», con
  «En `api/`» y partida en dos líneas— y afirmando que ningún límite contiene a otro
  (`test/planning/contract.test.js`, «una lista declarada llega una vez…»).
- **Tradeoff 1, el párrafo en prosa que repite una viñeta deja de contarse → se aceptó**, como decía el
  caso: es el mismo límite.
- **Tradeoff 2, que `own` y `limits()` normalicen con la misma función → se decidió que no.** `limits()`
  saca el `- ` sólo al principio de la línea (`/^[-*]\s+/`) y `marked()` también con sangría (`BULLET`).
  Unificarlas cambia qué entra por el camino viejo: una viñeta sangrada con «El runner» fuera de
  `### Límites`, que hoy no llega, pasaría a llegar. Es una decisión sobre la gramática vieja, no sobre esta
  copia. Lo que sí se midió es que la diferencia no vuelve a duplicar: con viñetas sangradas bajo
  `### Límites` llegan una vez cada una (ver «Fix propuesto»).
- **La lista con la gramática vieja fuera de `### Límites`, que llega pegada en un límite → sin
  arreglar.** No es este defecto y no duplica nada. Queda escrita en «Lo que apareció al correrlo», a
  decidir si merece un caso propio.
- **«Sube a alta si el preámbulo tiene un tope» → no hizo falta mirarlo**: el defecto se cerró antes.

**Probado corriendo.** Mutación, en una copia del árbol con la prueba nueva adentro: volver a
`[...marked(text).bullets, ...prose]` sin el filtro `taken` pone roja «una lista declarada llega una vez…»
(16 pasan y 1 falla de 17); con el arreglo pasan las 17. En el banco `suelto`, con el motor enlazado al
árbol arreglado y `node tools/ops.js contract . --json`: sin cambios, 3 límites; con las dos viñetas de la
reproducción, 5, y los dos últimos son `El runner no toca migraciones…` y `Nunca publica en \`main\`.`, sin
la lista pegada. Lo mismo con la primera viñeta partida en dos líneas: 5. En `main` las dos daban 6.
`npm run ci`: 1005 pruebas, exit 0.
