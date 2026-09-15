---
caso: 146
titulo: Cada PR del ciclo de aprendizaje cuesta una autorización de CI aunque el informe declare que no hay nada que decidir
estado: descartado
prioridad: media
version-detectada: 0.89.0
---

# 146 — El auto-merge que evita la revisión no evita la autorización, y el costo escala con los cargos

**⚪ descartado** · detectado en 0.89.0 · prioridad **media** — el costo es real y las tres salidas que el
caso proponía se cayeron al medirlas: no hay ninguna que un workflow pueda tomar sin guardar la
credencial que la compuerta existe para no necesitar

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
- La 2 mete una credencial de larga vida cuya superficie no se limita al ciclo que la necesita. (Este
  tradeoff decía además «en un repositorio que hoy no tiene ninguna», y **era falso**: ver el cierre.)
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

## Cierre

**⚪ descartado el 2026-09-14** · `AGENTS.md` · sin cambio de código

El costo que el caso denuncia es real y está medido: hasta 53 autorizaciones por semana. Lo que se cayó
son **las tres salidas**, cada una por una razón distinta, y ninguna se descartó por opinión. Lo que queda
es un procedimiento, y por eso el caso se cierra en vez de quedar esperando una decisión que no existe.

### Contra lo que el caso enumeró

- **Opción 1, una GitHub App** — **se decidió que no**, y el argumento con que la propuse era débil. La
  sostenía que «no guarda credencial de larga vida en un repositorio que hoy no tiene ninguna». Falso: el
  repositorio guarda `ANTHROPIC_API_KEY` y `CLAUDE_CODE_OAUTH_TOKEN` desde agosto de 2026. La política que
  invoqué es `AGENTS.md:344` y dice «no hay ninguna credencial **de npm** guardada» —es sobre `release.yml`
  y el trusted publishing—, así que estiré una regla angosta para cubrir todo el repositorio. Sin ese
  argumento, montar y mantener una App para ahorrar una autorización por PR no se paga.
- **Opción 2, un PAT** — **se decidió que no**, y por lo que la compuerta significa, no por la política que
  cité mal. Guardar el PAT sería darle al repositorio la credencial para autorizarse a sí mismo, que es
  exactamente lo que el gate existe para impedir.
- **Opción 3, aceptarlo como costo documentado** — **es lo que se hizo**, con el agregado que faltaba: el
  procedimiento quedó escrito en `AGENTS.md`, sección «Destrabar una tanda semanal». Sin eso, «revisá los
  PR» dependía de que alguien recordara el criterio.
- **Tradeoff «la 1 cuesta montar y mantener una App»** — confirmado, y terminó siendo decisivo una vez que
  su contrapartida resultó falsa.
- **Tradeoff «la 2 mete una credencial de larga vida»** — la mitad que decía «en un repositorio que hoy no
  tiene ninguna» está **corregida en el propio tradeoff**, no borrada: la afirmación equivocada se deja
  visible porque es el hallazgo.
- **Tradeoff «la 3 deja el costo escalando con los cargos»** — vigente y sin resolver. Con 53 cargos son
  hasta 53 autorizaciones semanales, y eso no cambió: lo que cambió es que no hay forma de evitarlo que no
  cueste más que el costo.
- **«Vale la pena mirar si la autorización se puede dar en tanda»** — **se miró, y la respuesta es doble.**
  Técnicamente **no es posible** desde un workflow: la doc del `GITHUB_TOKEN` declara que sus eventos no
  crean corridas nuevas «with the following exceptions», y los `pull_request` de tipo `opened` /
  `synchronize` / `reopened` son la excepción que nace **requiriendo aprobación de una persona con permiso
  de escritura**. La otra vía tampoco existe: el `bypass_actors` del ruleset tiene un único actor
  —`ingeniomaps`, id 6892023, tipo `User`— y no el bot, así que un workflow tampoco puede saltear los
  checks. Un action manual haría falta correrlo con un PAT guardado, que es la opción 2 con otro nombre.
  Y aun si fuera posible, **no convendría**: aprobar por «está pendiente» en vez de por «es inocuo» es la
  quita que R9 describe —se escribe sumando una bandera y lo que desaparece es la pregunta, no el riesgo—.

### Lo que el caso no preveía

- **La premisa de su propia recomendación era falsa, y la corrigió quien la leyó.** El caso afirmaba que el
  repositorio no guarda credenciales. Comprobarlo llevó una llamada a la API de secretos, y no la hice
  antes de escribir la recomendación: es el modo de fallo de R14 —afirmar de memoria lo que se establece
  con una invocación inocua— cometido dentro de un caso que trata justamente sobre verificar.
- **Lo que vuelve inocuo autorizar no es una coincidencia: está comprobado en origen.** Antes de commitear,
  `agent-learning.yml` corre `git status --porcelain -uall` y aborta si aparece algo que no sea el informe
  —«Se esperaba exactamente el informe de $AGENT y nada más»—. Y `ci.yml` declara `permissions: contents:
  read` sin referenciar un solo secreto. O sea que en este repositorio la compuerta cuida bastante menos de
  lo que el caso general de GitHub supone, y eso es lo que hace defendible autorizar sin leer el diff
  entero — no la costumbre.
- **El auto-merge nunca mergeó sin autorización, y el recuerdo de que sí lo hizo era la mitad del cuadro.**
  El PR #277 del 2026-09-08, el primer auto-merge del ciclo, tiene una sola corrida y figura con
  `triggering_actor=ingeniomaps`: también se autorizó. Lo que ahorró fue la **review**, no la autorización,
  que es exactamente la mitad que el comentario del workflow promete.

### Qué se corrió

- **Los tres valores legales de la política de aprobación**, enumerados por la propia API al rechazar uno
  inválido: `first_time_contributors_new_to_github`, `first_time_contributors`,
  `all_external_contributors`. Ninguno es un «nunca», así que la salida por configuración no existe.
- **El barrido de 50 corridas de `ci.yml`**: toda corrida con `triggering_actor=github-actions[bot]` quedó
  en `action_required`; toda la que corrió la disparó una persona. Del 2026-09-10 al 2026-09-14, en ramas
  de release y del ciclo por igual.
- **La búsqueda del contraejemplo, en tres páginas de historial**: las únicas tres corridas del bot que
  llegaron a correr sin autorización son de `release/0.75.0` y `release/0.86.0`, y son corridas de *push*
  sobre ramas que ya tenían PR abierto —la del #405 arrancó `16:31:31`, tres segundos después de crearse el
  PR a las `16:31:28`—, no de la apertura de un PR.
- **El descarte de que el disparador fuera el cron**: las corridas de `agent-learning.yml` figuran todas
  con `actor=ingeniomaps`, tanto las de `schedule` como las de `workflow_dispatch`. Lanzarlo a mano no
  cambia nada.
- **Los secretos del repositorio**, que refutaron la premisa de la opción 1.
- **Los archivos de los 17 PR de la tanda**: un `.md` cada uno, cero fuera de `learning/reports/`.
- **La tanda entera destrabada con el procedimiento**: 17 autorizaciones, los 9 `propone: no` cerrados por
  auto-merge sin una sola review.
- **Verde**: `npm run ci` en 0.
