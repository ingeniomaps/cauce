.DEFAULT_GOAL := help

.PHONY: help check tree context test coverage ci automation-check integration-check
.PHONY: require-agent agent-learn agent-propose agent-evaluate require-team team-check team-show
.PHONY: install-claude install-codex install-gemini install-antigravity
.PHONY: doctor-claude doctor-codex doctor-gemini doctor-antigravity

help: ## Muestra los comandos disponibles y su propósito
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make <comando>\n\n"} \
	/^[a-zA-Z0-9_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Valida la plantilla canónica de planificación
	@node engine/cli/ops.js check template/planning

tree: ## Muestra el estado de la planificación
	@node engine/cli/ops.js tree template/planning

context: ## Muestra el contexto mínimo de la tarea vigente
	@node engine/cli/ops.js context template/planning

test: ## Ejecuta todas las pruebas del toolkit
	@bash test/hooks-smoke.sh
	@node --test test/*.test.js

coverage: ## Ejecuta las pruebas y exige los umbrales de cobertura
	@bash test/coverage.sh

automation-check: ## Valida guards, workflows y runners del toolkit
	@node engine/cli/ops.js automation check .

integration-check: ## Valida la integración Jira de la plantilla
	@node engine/cli/ops.js integration check template jira

ci: check automation-check integration-check coverage ## Ejecuta todos los controles de CI

install-claude: ## Instala hooks y workflows para Claude en este proyecto
	@node engine/cli/ops.js automation install . claude

install-codex: ## Instala hooks para Codex en este proyecto
	@node engine/cli/ops.js automation install . codex

install-gemini: ## Instala contexto, comandos y configuración para Gemini
	@node engine/cli/ops.js automation install . gemini

install-antigravity: ## Instala el plugin Project Ops para Antigravity CLI
	@node engine/cli/ops.js automation install . antigravity

doctor-claude: ## Diagnostica la instalación de Claude
	@node engine/cli/ops.js automation doctor . claude

doctor-codex: ## Diagnostica la instalación de Codex
	@node engine/cli/ops.js automation doctor . codex

doctor-gemini: ## Diagnostica la instalación de Gemini
	@node engine/cli/ops.js automation doctor . gemini

doctor-antigravity: ## Diagnostica la instalación de Antigravity CLI
	@node engine/cli/ops.js automation doctor . antigravity

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
