.DEFAULT_GOAL := help

# Los gates delegan en los scripts de `package.json`: ese nombre lo tienen fijo `ci.yml`, el guard
# `verify` y `prepublishOnly`. Escribir el comando de los dos lados ya derivó una vez.
.PHONY: help check tree context test coverage coverage-update ci automation-check integration-check
.PHONY: require-agent agent-learn agent-propose agent-evaluate require-team team-check team-show

help: ## Muestra los comandos disponibles y su propósito
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make <comando>\n\n"} \
	/^[a-zA-Z0-9_-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Valida la plantilla canónica de planificación
	@npm run --silent check

tree: ## Muestra el estado de la planificación
	@node engine/cli/ops.js tree template/planning

context: ## Muestra el contexto mínimo de la tarea vigente
	@node engine/cli/ops.js context template/planning

test: ## Ejecuta todas las pruebas del toolkit
	@npm run --silent test

coverage: ## Ejecuta las pruebas y exige los umbrales de cobertura
	@npm run --silent coverage

coverage-update: ## Recalcula los pisos de cobertura por archivo
	@npm run --silent coverage:update

automation-check: ## Valida guards, workflows y runners del toolkit
	@npm run --silent automation:check

integration-check: ## Valida la integración Jira de la plantilla
	@npm run --silent integration:check

ci: ## Ejecuta todos los controles de CI
	@npm run --silent ci

require-agent:
	@test -n "$(AGENT)" || (echo "Falta AGENT=<slug>" >&2; exit 2)

agent-learn: require-agent ## Prepara el informe semanal de AGENT=<slug>
	@node engine/cli/ops.js learn "$(AGENT)"

agent-propose: require-agent ## Consolida una propuesta para AGENT=<slug>
	@node engine/cli/ops.js learn "$(AGENT)" --proposal

agent-evaluate: require-agent ## Evalúa controles y casos de AGENT=<slug>
	@node engine/cli/ops.js evaluate "$(AGENT)"

require-team:
	@test -n "$(TEAM)" || (echo "Falta TEAM=<slug>" >&2; exit 2)

team-check: require-team ## Valida contrato, agentes y etapas de TEAM=<slug>
	@node engine/cli/ops.js team check "$(TEAM)"

team-show: require-team ## Muestra el recorrido de TEAM=<slug>
	@node engine/cli/ops.js team show "$(TEAM)"
