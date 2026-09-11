---
caso: 093
titulo: La suite falla bajo verify cuando hay archivos sin trackear, porque una prueba hereda la variable que el guard agrega
estado: resuelto
resuelto-en: 0.80.0
prioridad: alta
version-detectada: 0.79.0
---

# 093 — Una prueba de `verify` mide el entorno que el propio `verify` le pone

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **alta** — frena todo commit de código en este
repositorio mientras el árbol tenga algo sin trackear, y no hay salida angosta: `.ops-approval` vive en
`planning/`, que acá no existe

## Resumen

Cuando el árbol difiere del índice, `verify` materializa el índice en una copia y corre la suite con
`npm_config_verify_deps_before_run=false` (`engine/hooks/shell.js`, `commitTree`). La prueba
`la copia recibe la palanca que apaga la sincronización…` (`test/wiring/hooks.test.js:1573`) lanza a su vez
`verify` sobre un banco y afirma que, sin copia, el gate ve esa variable **vacía**. Pero la hereda del
`verify` de afuera, así que ve `false` y falla.

Con el árbol limpio no hay copia ni variable, y la suite pasa: por eso no se vio. Basta un archivo sin
trackear —cualquier trabajo que se commitea por partes— para que todo commit de código se frene.

## Reproducción

Desde un checkout de Cauce con algún archivo sin trackear, armando la copia como `commitTree`: el árbol de
`HEAD`, lo ignorado enlazado y la variable puesta.

```bash
T=$(mktemp -d /tmp/ops-verify-repro-XXXX)
git archive HEAD | tar -x -C "$T"
git ls-tree -r --name-only -z HEAD > /tmp/lista-093
for e in .cauce-eval .env .gitconfig .npmrc; do ln -s "$PWD/$e" "$T/$e"; done
( cd "$T" && git init -q && xargs -0 -a /tmp/lista-093 git add -- \
  && npm_config_verify_deps_before_run=false npm test )
```

## Síntoma

Salida real, 2026-09-10, sobre `HEAD` = 0.79.0 (`35ef0a11`):

```
ℹ tests 671
ℹ pass 670
ℹ fail 1
✖ la copia recibe la palanca que apaga la sincronización, y ya no la que desarma confirmaciones
  AssertionError [ERR_ASSERTION]: sin copia no se le cambia el entorno a nadie
    actual: 'verify=false desarmadas=\n',
    expected: /^verify=vacio desarmadas=$/m,
```

Y bajo el guard real, al commitear código con archivos sin trackear:

```
BLOQUEADO: Verify falló en cauce: test (exit 1, 43.7 s): ✔ el error de --bench dice qué hacer, …
```

La línea que muestra el bloqueo es la primera de la salida, que es una prueba en verde: el mensaje no dice
cuál falló (094).

## Causa raíz

La prueba ya despeja `CI` a mano por esta misma razón —«lo que se mide es qué agrega el guard, no qué traía
el entorno»— y no despeja `npm_config_verify_deps_before_run`, que es justamente lo que el guard agrega. Se
escribió en `632cdc8b` (caso 070), el mismo día en que el guard empezó a poner esa variable.

## Fix propuesto

Despejar también `npm_config_verify_deps_before_run` en las dos mitades de la prueba, y restaurarla al
salir, igual que `CI`.

## Tradeoffs

Ninguno de conducta: el guard no cambia. La prueba deja de depender de si corre anidada.

## Contexto de descubrimiento

2026-09-10, commiteando el arreglo del 088 por partes: los tres commits de documentación pasaron —`verify`
no corre sin archivos de código— y el primero de código se frenó dos veces. Cuatro reproducciones que no
enlazaban lo ignorado o no ponían la variable pasaron en verde; la que la ponía, sobre `HEAD` y sin el
cambio del 088, falló igual.

## Relacionados

- **070** — el caso que agregó la variable y esta prueba.
- **094** — el mensaje de `verify` muestra la primera línea de la salida, no la prueba que falló.
- **095** — el otro fallo que el mismo `verify` produce en la misma corrida.

## Cierre

**🟢 resuelto en 0.80.0** · `test/wiring/hooks.test.js`

- **Fix propuesto** — hecho: la prueba despeja `CI` y `npm_config_verify_deps_before_run` en una sola
  lista, `ISOLATED`, y restaura las dos al salir. El comentario que explicaba el despeje de `CI` estaba
  escrito dos veces con dos redacciones; quedó uno, que nombra las dos variables y por qué.
- **Tradeoffs** — se cumple: este arreglo no toca `engine/`, sólo la prueba.
- **La línea sobre el mensaje de `verify`** — no le toca a este caso: salió como el **094**.

### Lo que el caso no preveía

**Este arreglo solo no destrababa el commit.** Con él en el índice, `verify` siguió frenando: debajo había
un segundo fallo, que la reproducción del caso no mostraba porque stageaba una lista explícita en vez de
`add --all`. Es el **095**, y los dos se commitean juntos porque ninguno pasa la puerta sin el otro —medido
abajo—.

### Qué se corrió

- `npm_config_verify_deps_before_run=false node --test test/wiring/hooks.test.js`, que es la condición bajo
  el guard: 62 de 62 en verde. Sin la variable: 62 de 62.
- **La mutación que devuelve el defecto**, en una copia desechable del repositorio (R23): `ISOLATED` sin la
  variable, corrida con la variable puesta. Comprobada aplicada antes de correr, dio `fail 1` en
  `la copia recibe la palanca…`, la misma prueba y el mismo mensaje de la reproducción.
- **El guard de verdad**, llamando a `verify` en proceso con un commit de entrada y capturando la salida del
  gate, con archivos sin trackear en el árbol:

  ```
  índice sin ningún arreglo        → FRENA · fail 2: la copia recibe la palanca… · ningún archivo… (EISDIR)
  índice con sólo este arreglo     → FRENA · fail 1: ningún archivo… (EISDIR, el 095)
  índice con sólo el arreglo 095   → FRENA · fail 1: la copia recibe la palanca…
  índice con los dos               → PASA  · 679 de 679
  ```
- **El commit que los lleva**, `c1685827`, pasó por `verify` con siete entradas sin trackear en el árbol,
  que es la condición que antes lo frenaba.
