---
caso: 147
titulo: La rama sobrevive al auto-merge porque `--delete-branch` no viaja con `--auto`, y la prueba que lo cuida mira la bandera en vez de la rama
estado: abierto
prioridad: media
version-detectada: 0.89.0
---

# 147 — Un arreglo que nunca funcionó, con una prueba en verde encima

**🔴 abierto** · detectado en 0.89.0 · prioridad **media** — el ciclo acumula una rama muerta por cargo y
por semana, y lo que debía impedirlo se puso hace seis días sin que nadie comprobara que hiciera algo

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
