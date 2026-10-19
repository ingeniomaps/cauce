---
caso: 395
titulo: La rama de una línea nueva sale del HEAD de la instancia, no de su base, y arrastra lo que esté sin mergear
estado: resuelto
resuelto-en: 0.111.0
prioridad: media
version-detectada: 0.110.0
---

# 395 — `ops line` crea `line/<nombre>` desde el `HEAD` en que esté la instancia: si está en una rama de trabajo, la línea nace con commits que no son suyos

**🟢 resuelto en 0.111.0** · detectado en 0.110.0 · prioridad **media**. La línea arranca con trabajo ajeno sin mergear, y su
primer PR lo lleva consigo. No avisa: la salida es la misma que con la instancia en la base.

## Resumen

`ops line` llama a `git worktree add -b line/<nombre> <árbol>` sin punto de partida, así que la rama sale del `HEAD`
de la instancia. Lo normal es que la instancia esté en una rama de trabajo (la de una tarea, la de CI) y no en la
base. La línea queda montada sobre esa rama.

## Reproducción

```bash
mkdir ws && cd ws && git init -q && git commit -q --allow-empty -m init
node <cauce>/engine/cli/ops.js init . --no-install
git ls-files -o --exclude-standard -z | xargs -0 git add -- && git commit -qm cauce
git checkout -q -b feature/sin-mergear && git commit -q --allow-empty -m "trabajo sin mergear"
node <cauce>/engine/cli/ops.js line . pagos
git -C ../ws-pagos log --oneline -2
node <cauce>/engine/cli/ops.js lines . | head -1
```

## Síntoma

Corrido dos veces el 2026-10-19 con el `main` de Cauce en `65a002af` (0.110.0). La segunda:

```
✓ …/ws-pagos  (line/pagos)
48ed0ee trabajo sin mergear
4573443 cauce
LÍNEAS  base: feature/sin-mergear
```

En una instancia real, la línea nació con un commit de una rama de CI todavía abierta, y hubo que apoyarla a mano en
`origin/main` antes de escribir nada.

## Causa raíz

`engine/cli/lines.js:81-82`: `['-b', where.branch, where.tree]` no lleva el commit de partida, y `git worktree add -b`
toma entonces el `HEAD` del repositorio.

## Fix propuesto

Pasar la base como punto de partida. **No sirve la `base:` que muestra `ops lines`**: es `trees[0].branch`
(`engine/planning/lines.js:89`), la rama en la que está el árbol principal, y en la reproducción vale
`feature/sin-mergear`. Partir de ahí repite el defecto.

La base que sí corresponde es una rama viva: `liveBranches()` (`engine/hooks/push.js:47`) ya sabe cuáles son —main,
master y la rama por defecto de cada remoto—. Se parte de `origin/<viva>` si existe, o de la local. Si la instancia
está en otra rama, la salida lo dice. Cuando `line/<nombre>` ya existe, no se toca.

La aceptación pide la mutación: con el punto de partida quitado, la prueba que parte desde `feature/sin-mergear` se
pone roja porque el log de la línea trae «trabajo sin mergear».

## Tradeoffs

- Quien quiera a propósito una línea montada sobre una rama de trabajo pierde ese atajo; un `--from <ref>` lo cubre.
- Partir de `origin/<viva>` exige que esté al día; sin `fetch` puede quedar atrás de la local.
- Con más de una rama viva (dos remotos con defaults distintos) hay que elegir una, y decirlo.

## Contexto de descubrimiento

Al crear una línea en una instancia real. Se vio al revisar el log del worktree nuevo, antes del primer commit.

## Relacionados

- 394 — el diseño nuevo de la línea. Ahí el worktree pasa a ser del repo del producto, en `lines/<nombre>/<repo>/`,
  y el defecto es el mismo: `git worktree add -b` sin punto de partida toma el `HEAD` del checkout principal de ese
  repo. La rama viva se busca en el repo del producto, no en la instancia.

## Cierre

**Resuelto en 0.111.0.** `ops line` pasa un punto de partida a `git worktree add -b`, sacado de `startPoint`
(`engine/planning/lines.js` desde el caso 394).

### El recorrido de lo que este caso enumeró

- **Pasar la base como punto de partida — se hizo distinto.** No con `liveBranches()`: devuelve nombres de rama sin el
  remoto, y lo que hace falta es la referencia de donde partir. `startPoint` busca primero la rama por defecto anotada
  en `refs/remotes/<remoto>/HEAD`, como `origin/trunk`, y después `main` o `master` locales. Sin ninguna queda el
  `HEAD`, que es lo único que hay. Mismo criterio que `liveBranches()` para decidir qué rama es viva.
- **Si la instancia está en otra rama, decirlo — se hizo.** Un aviso con la rama en que estaba, de dónde salió la
  línea y cómo montarla sobre la otra. Y la salida dice siempre `sale de: <ref>` en una línea nueva.
- **Cuando `line/<nombre>` ya existe, no tocarla — se hizo.** Se usa tal cual, sin punto de partida ni aviso.
- **Tradeoff, `--from <ref>` — se decidió que no.** La rama que ya existe es la salida: `git branch line/<nombre>
  <ref>` antes de `ops line` da lo mismo sin una bandera más, y el aviso lo dice.
- **Tradeoff, `origin/<base>` puede estar atrás sin `fetch` — se decidió que no hacer `fetch`.** `ops line` no habla
  con el remoto; parte de lo último que se bajó, y `sale de:` dice de qué referencia.
- **Tradeoff, más de una rama viva — se atendió a medias.** Gana el primer remoto con `HEAD` anotado, en el orden de
  `for-each-ref`, y `sale de:` lo nombra. No se pregunta cuál: no se conoce una instancia con dos remotos de defaults
  distintos.

### Lo que el caso no preveía

- La primera versión del caso proponía partir de la `base:` de `ops lines`. Esa base es la rama del árbol principal
  (`engine/planning/lines.js:89`), y en la reproducción vale `feature/sin-mergear`: el arreglo habría repetido el
  defecto. Se vio corriendo la reproducción antes de arreglar.
- El diseño nuevo de las líneas (caso 394) mueve el worktree al repo del producto. `startPoint` recibe la carpeta del
  repo, así que sirve igual ahí. Con el 394 pasó a `engine/planning/lines.js`, que lo usa también `ops lines`, y la
  prueba pasó a medir el checkout de ese repo: `la rama de una línea nueva sale de la rama viva y no del HEAD del
  checkout`. La mutación que le quita el punto de partida se volvió a ver en rojo ahí.

### Qué se corrió

- **La prueba nueva, en rojo antes del arreglo**:
  `la rama de una línea nueva sale de la rama viva y no del HEAD de la instancia` (`test/wiring/lines.test.js`) falló
  con `AssertionError: la línea arrastró la rama de trabajo` y dos SHA distintos.
- **Tres mutaciones, las tres en rojo**: sin el punto de partida en `git worktree add`, vuelve
  `la línea arrastró la rama de trabajo`; sin el aviso, falla el `assert.match` de `está en feature/sin-mergear`; y
  sin la rama por defecto del remoto, `from` sale `''` donde se esperaba `origin/trunk`.
- **La reproducción del caso, con el arreglo**: `git -C ../ws-pagos log --oneline -2` da `4c338c6 cauce` y
  `fbc3b27 init`, sin «trabajo sin mergear», y la salida trae
  `⚠ La instancia está en feature/sin-mergear; line/pagos sale de main, la rama viva.`
