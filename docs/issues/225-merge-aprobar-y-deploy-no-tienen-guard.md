---
caso: 225
titulo: merge, aprobar un PR, workflow run y deploy no tienen guard
estado: abierto
prioridad: alta
version-detectada: 0.99.2
---

# 225 — R10 dice que sólo el push tiene forma reconocible, y `gh pr merge`, `gh workflow run` o un deploy declarado sí la tienen

**🔴 abierto** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**, y antes de construir hay que decidir: reabre lo que el caso 025 cerró. Las dos instancias construyeron este guard por su cuenta, y conorbi tuvo dos merges reales sin autorizar (PR #9 y #14).

## Resumen

R10 nombra seis actos de publicación —push, PR, merge, tags, deploy y rollback— y el motor comprueba sólo el push, porque «los otros cinco no tienen una forma reconocible en un comando». Para `gh pr merge`, `gh api …/pulls/N/merge`, aprobar o cerrar un PR, `gh pr create` sin `--repo` y `gh workflow run`, eso no es así. roax-ops (`automatization/bin/roax-delivery-guard.js`, 169 líneas con pruebas) y conorbi-ops (`automatization/bin/conorbi-delivery-guard.js`, con pruebas) los frenan y se destraban por chat o por `.ops-approval`; conorbi agrega deploys declarados por proyecto (terraform/tofu, kubectl, targets de un Makefile) con una lista de lectura cerrada por defecto.

## Reproducción

Pendiente al tomar el caso: en un banco instalado, comprobar que `gh pr merge 1 --repo x/y` no lo frena ningún guard de Cauce.

## Síntoma

Un agente mergea, aprueba o despliega sin que nadie lo autorice; el límite lo sostiene sólo la regla escrita.

## Causa raíz

`engine/hooks/push.js` gobierna sólo `push`. `docs/issues/025-*.md` decidió no gobernar merge ni deploy. R10, en `template/planning/rules/system/commits.md`.

## Fix propuesto

Un guard de entrega con las formas genéricas (`gh` sobre PRs y workflows) en el motor, y las formas de deploy de cada proyecto declaradas en `ops.config.json`, cerradas por defecto (R27). Los ítems pasan por la misma aprobación que el push, y R10 se corrige para decir qué comprueba el motor.

## Tradeoffs

- Contradice una decisión tomada (025): se decide antes de construir.
- Depende de 221: con la confirmación de hoy, el guard se destrabaría con cualquier mensaje.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 025 — la decisión que reabre.
- 221 — la confirmación que lo destraba.
- R10.
