---
caso: 486
titulo: La firma de una propuesta sella la punta de la rama, no el commit que se aprobó
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 486 — La firma de una propuesta sella la punta de la rama, no el commit que se aprobó

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: es la única puerta humana del ciclo de aprendizaje, y el ruleset no descarta las aprobaciones viejas (comprobado el 2026-11-05).

## Resumen

`sign-proposal.yml` se dispara con la aprobación de la review, pero hace checkout de la rama del PR tal como está cuando corre el job, no del commit que se aprobó. Lo que se empuje entre la aprobación y el job queda firmado sin que nadie lo haya revisado. Además, nada compara después si la propuesta firmada cambió: «firmada» es una línea de texto, sin huella del contenido.

## Reproducción

**Todavía no se reprodujo.** La que falta, en un repositorio desechable con este workflow:

1. Abrir un PR con una propuesta `- Estado: pendiente`.
2. Aprobar la review y, antes de que el job haga checkout, empujar un commit que cambie «Cambio propuesto».
3. Ver si la propuesta firmada trae el cambio no revisado.

Una vez firmada, se edita «Cambio propuesto» en otro commit y se mira si `agent-promote` la aplica sin decir nada.

## Causa raíz

- `.github/workflows/sign-proposal.yml:42`: `ref: ${{ github.event.pull_request.head.ref }}` es la rama, no `github.event.review.commit_id`.
- `:52`: el push va a esa misma rama.
- `:67-77`: firma toda propuesta con `- Estado: pendiente` que el diff contra `BASE` traiga, sin mirar en qué commit se aprobó.
- `engine/agents/learning-files.js:36`: «firmada» es la regex `^- Estado: aprobada$`, sin huella del contenido.

## Fix propuesto

1. En `sign-proposal.yml`, hacer checkout de `github.event.review.commit_id` y negarse si la punta de la rama ya no es ese commit. El mensaje tiene que nombrar los dos SHA y decir que hay que volver a aprobar.
2. Opcional, y lo decide la persona: que la firma escriba la huella del contenido de «Cambio propuesto», y que `agent-promote` se niegue si no coincide.

## Tradeoffs

- **No hay atenuante en el ruleset.** Comprobado el 2026-11-05 con `gh api repos/ingeniomaps/cauce/rulesets/21259587` (exit 0): el ruleset `main` tiene `dismiss_stale_reviews_on_push: false`, `require_last_push_approval: false` y `required_approving_review_count: 0`. Un push después de aprobar no descarta la aprobación, y la firma ya escrita sigue valiendo aunque después cambie «Cambio propuesto». Si activarlo cerraría el hueco no está comprobado: la firma ya es un commit escrito cuando llega el push siguiente.
- **La firma es un commit nuevo sobre la rama** (AGENTS.md, «Qué clic firma», paso 4). Con el punto 1, la punta deja de coincidir con el commit aprobado apenas el bot firma. La comprobación tiene que hacerse antes de firmar, no después.
- No baja a las instancias: el workflow es de este repositorio. El punto 2 sí bajaría, porque `agent-promote` viaja en el paquete.
- `engine/hooks/approval.js` coteja por ruta y no por contenido a propósito. Este caso no lo toca.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Su catálogo de reglas ata cada autorización a los bytes revisados con una huella sha256, y la aprobación caduca si cambia algo pertinente.

## Relacionados

- Caso 146: quién abre los PR del ciclo y por qué su CI espera.
- Caso 142: propuestas firmadas con el molde intacto.
