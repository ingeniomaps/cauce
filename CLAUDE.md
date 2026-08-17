# Cauce

@AGENTS.md
@template/planning/rules/system/process.md
@template/planning/rules/system/code-shape.md
@template/planning/rules/system/commits.md
@template/planning/rules/system/conduct.md

Escrito a mano, como `.claude/settings.json` y por la misma razón: `automation install` arma la
superficie de consumo de una empresa y acá fabricamos el toolkit. Las reglas viven una sola vez en los
archivos importados arriba; este archivo sólo los trae, porque Claude Code lee `CLAUDE.md` y no
`AGENTS.md`. Otro runner necesita su propio puntero —Codex ya lee `AGENTS.md` directo—.
