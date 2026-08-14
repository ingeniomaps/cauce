.DEFAULT_GOAL := help

.PHONY: help check tree context automation-check
.PHONY: require-agent agent-learn agent-propose agent-evaluate
.PHONY: install-claude install-codex install-gemini install-antigravity
.PHONY: doctor-claude doctor-codex doctor-gemini doctor-antigravity

help: ## Muestra los comandos disponibles y su propósito
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make <comando>\n\n"} \
	/^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Valida planning e integraciones
	@node tools/ops.js check planning

tree: ## Muestra roadmap, backlog, WIP y Done
	@node tools/ops.js tree planning

context: ## Muestra el contexto mínimo de la tarea vigente
	@node tools/ops.js context planning

automation-check: ## Comprueba hooks, workflows y adaptadores
	@node tools/ops.js automation check .

require-agent:
	@test -n "$(AGENT)" || (echo "Falta AGENT=<slug>" >&2; exit 2)

agent-learn: require-agent ## Prepara el informe semanal de AGENT=<slug>
	@node tools/ops.js learn "$(AGENT)"

agent-propose: require-agent ## Consolida una propuesta para AGENT=<slug>
	@node tools/ops.js learn "$(AGENT)" --proposal

agent-evaluate: require-agent ## Evalúa controles y casos de AGENT=<slug>
	@node tools/ops.js evaluate "$(AGENT)"

install-claude: ## Instala hooks y workflows para Claude
	@node tools/ops.js automation install . claude

install-codex: ## Instala hooks para Codex
	@node tools/ops.js automation install . codex

install-gemini: ## Instala contexto, comandos y configuración para Gemini
	@node tools/ops.js automation install . gemini

install-antigravity: ## Instala el plugin Project Ops para Antigravity CLI
	@node tools/ops.js automation install . antigravity

doctor-claude: ## Diagnostica la instalación de Claude
	@node tools/ops.js automation doctor . claude

doctor-codex: ## Diagnostica la instalación de Codex
	@node tools/ops.js automation doctor . codex

doctor-gemini: ## Diagnostica la instalación de Gemini
	@node tools/ops.js automation doctor . gemini

doctor-antigravity: ## Diagnostica la instalación de Antigravity CLI
	@node tools/ops.js automation doctor . antigravity
