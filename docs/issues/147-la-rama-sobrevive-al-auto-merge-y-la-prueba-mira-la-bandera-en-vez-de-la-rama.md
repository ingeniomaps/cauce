---
caso: 147
titulo: La rama sobrevive al auto-merge porque `--delete-branch` no viaja con `--auto`, y la prueba que lo cuida mira la bandera en vez de la rama
estado: abierto
prioridad: media
version-detectada: 0.89.0
---

# 147 — Un arreglo que nunca funcionó, con una prueba en verde encima

**🔴 abierto** · detectado en 0.89.0 · prioridad **media** — el arreglo está construido y su cierre
escrito abajo; se marca `resuelto` al publicar **0.90.0**, porque hasta entonces sigue mordiendo a todo
el que instale (`docs/issues/README.md`)

## Resumen

Cuando un informe declara `propone: no`, `agent-learning.yml:779` arma auto-merge con la bandera de
borrado puesta:

```bash
gh pr merge "$branch" --auto --merge --delete-branch
```

La rama no se borra. `--delete-branch` lo aplica `gh` **después** de mergear, y con `--auto` el comando
termina al *armar* el auto-merge —el merge ocurre horas después, sin `gh` presente—, así que ese momento
no llega nunca. La API lo confirma: el `autoMergeRequest` que queda registrado guarda `mergeMethod`,
`enabledAt`, `enabledBy`, `commitBody`, `commitHeadline` y `authorEmail`, y **ningún campo de borrado de
rama**. No hay dónde viajar.

El `delete_branch_on_merge: true` del repositorio tampoco cubre el hueco, y eso es lo que el comentario
contiguo ya sospechaba sin poder explicar.

## Reproducción

Sobre la tanda del 2026-09-14, que dejó los dos lotes que se contrastan: el que cerró el auto-merge y el
que cerró una persona con `gh pr merge --merge --delete-branch`.

```bash
set -a; . ./.env; set +a
git fetch --prune origin
git branch -r --format='%(refname:short)' | grep -v '^origin$'

for n in 433 436 439 440 443 446 447 448 449; do
  GH_TOKEN="$GITHUB_PAT_CAUCE" gh api repos/ingeniomaps/cauce/issues/$n/timeline --paginate \
    --jq '[.[] | select(.event=="head_ref_deleted")] | length'
done
```

## Síntoma

Nueve ramas vivas, y son exactamente las nueve auto-mergeadas:

```
origin/automation/backend-engineer-research-2026-09-14
origin/automation/cloud-architect-research-2026-09-14
origin/automation/database-administrator-research-2026-09-14
origin/automation/devops-engineer-research-2026-09-14
origin/automation/frontend-engineer-research-2026-09-14
origin/automation/machine-learning-engineer-research-2026-09-14
origin/automation/qa-engineer-research-2026-09-14
origin/automation/security-engineer-research-2026-09-14
origin/automation/site-reliability-engineer-research-2026-09-14
origin/main
```

Ninguna tiene `head_ref_deleted` —los nueve devuelven `0`—, y sus eventos terminan en
`auto_merge_enabled` / `merged` / `closed`, los tres por `github-actions[bot]`. Las ocho del lote manual
sí lo tienen, firmado por la persona que mergeó, y ya no existen. Las nueve tienen **cero commits fuera
de `main`**: residuo puro.

## Causa raíz

`.github/workflows/agent-learning.yml:779`. La bandera es correcta para un merge directo y **no tiene
efecto junto a `--auto`**. `gh pr merge --help` lo dice sin ambigüedad —«Delete the local and remote
branch **after merge**»— y con `--auto` no hay merge que esperar: el comando arma y sale.

## Lo que este caso corrige del registro

El comentario de `agent-learning.yml:774-777` afirma que la bandera se puso porque «la corrida de prueba
del 2026-09-08 mergeó el PR #277 sola y dejó su rama viva», y presenta el asunto como resuelto. **No lo
está, y nunca lo estuvo.** El timeline del #277 muestra `merged github-actions[bot]` seguido de
`head_ref_deleted ingeniomaps`: esa rama la borró **una persona, a mano, después**. Lo que se leyó como
el arreglo funcionando fue una limpieza manual. El arreglo se escribió, se probó mirando el texto del
workflow, y jamás se ejecutó contra una rama real.

## La prueba que lo deja pasar

`test/repo/ci-research-report.test.js:245`:

```js
assert.match(paso, /gh pr merge .*--delete-branch/, 'y borra la rama, que nadie más va a borrar')
```

Comprueba que **la bandera esté escrita en el workflow**, no que la rama desaparezca. Por eso está en
verde con el defecto presente en nueve ejemplares, y por eso el mensaje de la aserción —«y borra la
rama»— afirma más de lo que la línea mide. Es lo que R9 llama afirmar estructura en vez de conducta, y
su comentario contiguo repite la premisa falsa del workflow.

## Fix propuesto

No está decidido; la opción 1 es la que hoy parece correcta.

1. **Borrar la rama desde el propio workflow, después de que el merge ocurra.** Como el auto-merge cierra
   el PR más tarde, hace falta que alguien borre cuando eso pasa: un workflow con
   `on: pull_request: types: [closed]` que, si `merged == true` y la rama matchea `automation/*`, llame a
   `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`. Es el único camino que actúa en el momento
   correcto.
2. **Un barrido periódico** que borre ramas `automation/*` cuyo PR esté mergeado. Más simple y deja la
   rama viva un tiempo; no arregla la causa, la tolera.
3. **Quitar `--delete-branch` del `--auto` y decir la verdad en el comentario**, aceptando la rama muerta.
   Es la opción honesta si se decide no arreglarlo: hoy el comentario promete algo que no pasa.

Y en los tres casos, **la prueba tiene que cambiar**: una aserción sobre el texto del workflow no puede
volver a presentarse como que cuida el borrado.

## Tradeoffs

- La 1 agrega un workflow nuevo por algo que GitHub debería cubrir con `delete_branch_on_merge`, y hay
  que decidir si se acota a `automation/*` o vale para toda rama mergeada.
- La 2 deja una ventana en la que la rama existe, que es justamente lo que confunde al mirar la lista.
- La 3 no cuesta nada y deja el residuo creciendo: una rama por cargo y por semana, con 53 cargos.
- **Vale la pena mirar por qué `delete_branch_on_merge: true` no actúa cuando quien mergea es el
  auto-merge.** Está en `true` y verificado, y aun así no borró ninguna de las nueve. Si eso se explica,
  puede que no haga falta ninguna de las tres opciones.

## Prioridad

**Media.** No rompe nada y el residuo es barato de limpiar a mano. Lo que vale menos que no tenerlo es la
prueba: declara que cuida el borrado, está en verde, y el defecto ocurrió nueve veces debajo. Eso enseña
a no creerle al resto de la suite.

## Contexto de descubrimiento

Salió de la auditoría del 2026-09-14, al revisar qué quedaba abierto después de cerrar el 146. Las ramas
aparecieron en un listado de ramas remotas que primero leí **truncado**, lo que me hizo creer que el
patrón era «auto-merge sí, manual no» al revés de lo que era; el listado completo tras `git fetch
--prune` es lo que lo ordenó.

## Relacionados

- **146** — misma sección del workflow: ahí el hallazgo fue la autorización, acá el borrado.
- **143** — el caso que introdujo el auto-merge por `propone`.
- **148** — salió de acá: la puerta que dio verde mientras una prueba de este mismo arreglo estaba en rojo.

## Cierre

**Construido, a la espera de 0.90.0** · `.github/workflows/delete-merged-branch.yml`,
`.github/workflows/agent-learning.yml`, `test/repo/ci-research-report.test.js`,
`test/repo/ci-schedule.test.js`

El estado sigue en `abierto` a propósito: un caso se marca `resuelto` cuando la versión que lo arregla
está publicada, no cuando el PR mergea. Lo de abajo es el recorrido, que se hace cuando se hace el
trabajo y no al taguear.

Se tomó la **opción 1**, y el tradeoff que el caso dejó anotado es lo que la eligió: medirlo primero
descartó que hubiera una salida sin construir nada.

### Contra lo que el caso enumeró

- **«Vale la pena mirar por qué `delete_branch_on_merge: true` no actúa»** — **se miró, y es lo primero
  que se hizo.** En todo el historial del repositorio **no hay un solo `head_ref_deleted` que no haya
  firmado `gh` o una persona**: las ramas `release/` que desaparecieron las borró `gh` con la bandera, y
  el #277 —el precedente que el comentario citaba como arreglado— se mergeó `23:36:36` y se borró
  `23:43:33`, siete minutos después, por `ingeniomaps`. O sea que el ajuste está en `true` y nunca se lo
  vio borrar nada. Sin esa medición, la opción 1 habría sido una corazonada.
- **Opción 1, borrar desde un workflow cuando el merge ocurre** — **construida**, como
  `delete-merged-branch.yml`. `on: pull_request: types: [closed]` es el único evento que llega con el
  merge hecho, venga de auto-merge, de la web o de alguien sin la bandera.
- **Opción 2, un barrido periódico** — **se decidió que no**: tolera la causa en vez de arreglarla y deja
  una ventana con la rama viva, que es lo que confunde al mirar la lista.
- **Opción 3, quitar la bandera y decir la verdad** — **se hizo, y como parte de la 1, no en su lugar.**
  La bandera se quitó del `--auto` porque prometía algo que no pasaba, y el comentario ahora dice quién
  borra de verdad.
- **«Y en los tres casos la prueba tiene que cambiar»** — hecho, y en dos mitades. La vieja pasó de
  exigir `--delete-branch` escrito a **asercionar su ausencia**, acotada a la línea del comando. Y se
  agregó una prueba propia sobre el workflow nuevo, que mira las cinco condiciones que deciden si borra
  bien.
- **Tradeoff «la 1 agrega un workflow por algo que GitHub debería cubrir»** — confirmado y aceptado: la
  medición de arriba mostró que GitHub no lo cubre acá. Sobre acotarlo a `automation/*`, **se decidió que
  no**: vale para toda rama mergeada, porque el defecto no es del ciclo —el #277 y las de release
  sobrevivieron igual— y limitarlo por prefijo lo volvería a dejar entrar por otra puerta.
- **Tradeoff «la 3 deja el residuo creciendo»** — ya no aplica: no se tomó la 3 sola.

### Lo que el caso no preveía

- **La aserción de ausencia falló por mi propio comentario.** `--delete-branch` seguía apareciendo en el
  paso porque la prosa nueva lo nombra para explicar por qué se quitó, y la aserción miraba el paso
  entero. Se acotó a la línea del comando. El rojo fue útil: probó que la aserción mira algo.
- **Agregar un workflow rompe una prueba, a propósito.** `ci-schedule.test.js` enumera los workflows uno
  por uno y su comentario dice que agregar uno **obliga** a nombrarlo ahí. Se registró con su razón, sin
  aflojar la aserción.
- **La puerta del repositorio no ve una prueba en rojo, y salió como caso 148.** Durante este arreglo
  `npm run ci` dio **exit 0** con una prueba fallando. `ci` encadena `check`, `automation:check`,
  `integration:check`, `dead-code` y `coverage`, y el único que toca la suite es `coverage.sh`, que la
  corre con `|| true`. Es el mismo modo de fallo que este caso denuncia —una puerta que afirma más de lo
  que mide—, un nivel más arriba.

### Qué se corrió

- **El arreglo borrando una rama de verdad, que es la prueba que este caso vino a exigir.** El PR #463 —el
  que trae el arreglo— se mergeó **sin** `--delete-branch` a propósito: con la bandera la habría borrado
  `gh` y no se mediría nada. La rama `fix/147-borrar-la-rama-cuando-el-merge-ocurre` desapareció sola. La
  corrida queda registrada: evento `pull_request`, `completed/success`, y el paso «Delete the head branch»
  en `success`.

  Es distinta de todo lo demás de esta lista y por eso va primera: las mutaciones prueban que la aserción
  mira algo, y ésta prueba que el mecanismo hace algo. El caso nació justamente de un arreglo que tenía lo
  primero y nunca tuvo lo segundo.
- **La medición del ajuste del repositorio**, que decidió el desenlace: cero borrados atribuibles a
  `delete_branch_on_merge` en todo el historial; el #277 borrado a mano siete minutos después del merge.
- **Rojo previo**: con `delete-merged-branch.yml` fuera de lugar, la prueba nueva **falla** —`tests 9,
  pass 8, fail 1`—. Corrido en una copia desechable bajo el scratchpad, nunca sobre el árbol de trabajo.
- **Cinco mutaciones, las cinco en rojo**, una por condición: borrar el guard de `merged == true`, anular
  el de fork, cambiar el `DELETE` por `GET`, bajar el permiso a `contents: read`, y cambiar el trigger
  `closed` por `opened`. Ninguna quedó verde, así que no hay aserción decorativa.
- **La copia vuelve a verde** al restaurar, que es lo que separa una mutación medida de un árbol roto.
- **Suite entera por la vía que sí falla**: `npm test` → **825 pruebas, 825 pass, fail 0**, exit 0.
- **`dead-code`**: ninguna superficie muerta, con el workflow nuevo adentro.
- **Pasada de comentarios R11 a 0.22**: el primer encabezado del workflow repetía la explicación del caso
  y midió **0.319** —bajo la puerta de 0.45, sobre el umbral manual—; se recortó para que la razón viva
  sólo en el caso. Remedido: **0.152**.
