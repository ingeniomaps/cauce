---
caso: 146
titulo: Cada PR del ciclo de aprendizaje cuesta una autorización de CI aunque el informe declare que no hay nada que decidir
estado: abierto
prioridad: media
version-detectada: 0.89.0
---

# 146 — El auto-merge que evita la revisión no evita la autorización, y el costo escala con los cargos

**🔴 abierto** · detectado en 0.89.0 · prioridad **media** — el mecanismo que decide si un informe
necesita una persona ya existe y funciona; lo que no se puede evitar es destrabar la corrida

## Resumen

Un informe semanal declara `propone: si|no` en su frontmatter, y el ciclo actúa sobre ese campo: cuando
dice `no`, `agent-learning.yml` arma auto-merge para que el PR se cierre solo. El molde del informe lo
dice con todas las letras: «Un "no" se mergea sin revisión humana: no hay nada que decidir».

El ruleset de `main` exige `ci (24)` y `ci (current)` y **cero reviews**. O sea que sobre estos PR no
hay ninguna firma que dar. Lo único que los separa del merge son dos checks que **no arrancan solos**:
las corridas de un PR que abre `github-actions[bot]` nacen con `conclusion=action_required` y esperan
que alguien las autorice.

El resultado es que un PR sin nada que decidir cuesta igual una intervención humana. No una decisión:
una autorización.

## Reproducción

La tanda del 2026-09-14, diecisiete PR (#433–#449), nueve de ellos con `propone: no`:

```bash
set -a; . ./.env; set +a
for n in 433 436 439 440 443 446 447 448 449; do
  GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr view $n \
    --json number,autoMergeRequest,mergeStateStatus,statusCheckRollup \
    --jq '"#\(.number) auto-merge: \(if .autoMergeRequest then "ARMADO" else "no" end) estado: \(.mergeStateStatus) checks: \(.statusCheckRollup|length)"'
done
```

## Síntoma

```
#433  auto-merge: ARMADO  estado: BLOCKED  checks: 0
#436  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#439  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#440  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#443  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#446  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#447  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#448  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
#449  auto-merge: ARMADO  estado: UNKNOWN  checks: 0
```

Los nueve con `mergeable: MERGEABLE`. El auto-merge está puesto y correcto; lo que falta es la corrida.

Autorizar las nueve por API —una llamada cada una— las mergeó solas, sin ninguna review:

```bash
rid=$(gh api "repos/ingeniomaps/cauce/actions/runs?branch=$rama" \
  -q '[.workflow_runs[] | select(.conclusion=="action_required")] | .[0].id')
gh api --method POST "repos/ingeniomaps/cauce/actions/runs/$rid/approve"
```

## Causa raíz

No está en el motor, y decirlo es parte del caso: `agent-learning.yml:778` hace lo correcto y su
comentario contiguo —`agent-learning.yml:770-773`— ya describe el límite exacto:

> No garantiza que se mergee sin intervención: las corridas de un PR que abre el bot nacen
> en `action_required` y esperan autorización, así que el auto-merge queda armado y espera a
> que alguien la dé. Aun así ahorra la mitad del trabajo —una autorización en vez de una
> autorización y un merge— y se dispara solo el día que esas corridas arranquen solas.

Lo que este caso agrega es el **número**, que el comentario no tiene: `agents/roles/system/` tiene **53
cargos con ciclo de aprendizaje** y el cron es semanal (`17 13 * * 1`). El costo no son diecisiete
autorizaciones una vez: son hasta 53 por semana cuando el ciclo corra completo, sobre PR que el propio
repositorio ya clasificó como que no requieren decisión.

### Por qué nacen bloqueadas — verificado el 2026-09-14

GitHub cambió el comportamiento el **2026-06-11**: «Pull requests created by the `github-actions[bot]`
are now able to run your CI/CD workflows **with user approval**» —github.blog/changelog, «Bot-created
pull requests can run workflows if approved»—. Antes esos PR **no podían** correr workflows; desde ese
cambio corren, esperando a «a user with write access to the repository».

Eso explica las dos mitades a la vez y resuelve la tensión que el `AGENTS.md` declaraba sin resolver: la
cita «events triggered by the `GITHUB_TOKEN` will not create a new workflow run» describía el
comportamiento **viejo**, y las corridas que existen igual son el **nuevo**.

Lo que dispara la espera es **quién abre el PR**. Medido sobre 50 corridas de `ci.yml`:

- Toda corrida con `triggering_actor=github-actions[bot]` quedó en `action_required`.
- Toda la que corrió la disparó una persona.
- Va del 2026-09-10 al 2026-09-14, en ramas de release y del ciclo por igual: no es del ciclo de
  aprendizaje ni de esta semana.

Las dos corridas del 2026-09-13 sobre `release/0.86.0` que parecen correr solas no lo contradicen:
arrancaron `16:31:31`, tres segundos después de crearse el PR #405 (`16:31:28`). Son las corridas del
push sobre una rama que ya tenía PR abierto, no las de su apertura.

**No es el ruleset ni la configuración del repositorio.** `actions/permissions` devuelve
`{"enabled":true,"allowed_actions":"all"}` y el ruleset de `main` exige dos checks con cero reviews. Un
PR empujado desde la cuenta humana sobre el mismo repositorio y el mismo ruleset —el #459, que registró
este caso— arrancó CI solo.

## Fix propuesto

No está decidido, y **lo que falta primero es una decisión que cambia el producto**, no código.

**Lo que ya se descartó midiendo:** no hay ajuste que apagarlo. La política de aprobación admite
`first_time_contributors_new_to_github`, `first_time_contributors` y `all_external_contributors`
—los tres los enumeró la propia API al rechazar un valor inválido— y **ninguno es un «nunca»**. La vía
documentada para evitar la espera es una sola: que el PR lo abra una identidad de confianza en vez del
`GITHUB_TOKEN`.

1. **Una GitHub App propia para el ciclo.** Abre los PR con identidad propia y sus corridas arrancan
   solas, sin guardar una credencial de larga vida: la App firma tokens efímeros. Es más trabajo que un
   PAT y es la única opción que no contradice nada de lo ya declarado.
2. **Un PAT para el ciclo.** Más barato de montar y choca de frente con la política declarada en
   `AGENTS.md`: `release.yml` evita a propósito guardar una credencial, y «no guardarla es la mitad del
   punto». Un PAT abarca además más superficie que un token de publicación.
3. **Aceptarlo como costo documentado.** Es lo que el comentario del workflow ya hace. Registrar el
   número lo vuelve una decisión tomada en vez de un costo que nadie contó.

## Tradeoffs

- La 1 cuesta montar y mantener una App —registrarla, instalarla, firmar tokens en cada corrida— para
  ahorrar una autorización por PR. Es la opción correcta y no la barata.
- La 2 mete una credencial de larga vida en un repositorio que hoy no tiene ninguna, y la superficie que
  abre un PAT no se limita al ciclo que lo necesita.
- La 3 deja el costo escalando con los cargos: es aceptable con diecisiete y hay que volver a mirarlo
  con 53, que es el punto de este caso.
- **Vale la pena mirar si la autorización se puede dar en tanda**, por API sobre todas las corridas
  pendientes de una vez. No elimina el costo pero lo vuelve una llamada en vez de 53, y no exige ninguna
  decisión de producto.

## Prioridad

**Media.** No rompe nada y el ciclo entrega su valor igual. Lo que degrada es la promesa: un mecanismo
que dice «se mergea sin revisión humana» y necesita una intervención humana por PR enseña a no creerle
al resto, que es exactamente el daño que el caso 143 nombró en otro disfraz.

## Contexto de descubrimiento

Salió de revisar los diecisiete PR de la tanda del 2026-09-14 preguntándose si todos eran de valor. La
respuesta fue que sí, y que el repositorio ya los clasifica solo por `propone`. Lo que apareció al
medirlo es que la clasificación no se traduce en menos trabajo humano: los nueve que declaran no tener
nada que decidir costaron una autorización cada uno, igual que los ocho que sí proponen.

## Relacionados

- **143** — la misma forma: un paso del ciclo que gasta una intervención humana sin que haya nada que
  decidir.
- **142** — la propuesta sobre el molde, cuyo arreglo dejó la ola de propuestas `2026-09` archivadas que
  los informes de esta tanda repiten.
