.DEFAULT_GOAL := help

.PHONY: help check tree context upgrade automation-check
.PHONY: integration-check integration-sync require-key integration-promote
.PHONY: require-agent agent-learn agent-propose agent-evaluate require-team team-check team-show
.PHONY: install-claude install-codex install-gemini install-antigravity
.PHONY: doctor-claude doctor-codex doctor-gemini doctor-antigravity

# Jira es hoy el único proveedor; el día que haya otro se pasa PROVIDER=<slug>.
PROVIDER ?= jira

help: ## Muestra los comandos disponibles y su propósito
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make <comando>\n\n"} \
	/^[a-zA-Z0-9_-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Valida planning e integraciones
	@node tools/ops.js check planning

tree: ## Muestra roadmap, backlog, WIP y Done
	@node tools/ops.js tree planning

context: ## Muestra el contexto mínimo de la tarea vigente
	@node tools/ops.js context planning

# `init` fija la versión exacta del motor, así que `npm update` no la mueve: hay que pedir @latest.
# Sin este primer paso `upgrade` compara contra el motor instalado y contesta «al día» para siempre.
upgrade: ## Trae la última versión de Cauce y la aplica, sin tocar lo del proyecto
	@npm install --save-dev @ingeniomaps/cauce@latest
	@node tools/ops.js upgrade .

automation-check: ## Comprueba hooks, workflows y adaptadores
	@node tools/ops.js automation check .

integration-check: ## Valida configuración y staging, sin conectarse
	@node tools/ops.js integration check .

integration-sync: ## Lee el proveedor y actualiza staging; PROVIDER=<slug> para elegir otro
	@node tools/ops.js integration sync . "$(PROVIDER)"

require-key:
	@test -n "$(KEY)" || (echo "Falta KEY=<clave-remota>" >&2; exit 2)

integration-promote: require-key ## Promueve el draft KEY=<clave> al roadmap
	@node tools/ops.js integration promote . "$(PROVIDER)" "$(KEY)"

require-agent:
	@test -n "$(AGENT)" || (echo "Falta AGENT=<slug>" >&2; exit 2)

agent-learn: require-agent ## Prepara el informe semanal de AGENT=<slug>
	@node tools/ops.js learn "$(AGENT)"

agent-propose: require-agent ## Consolida una propuesta para AGENT=<slug>
	@node tools/ops.js learn "$(AGENT)" --proposal

agent-evaluate: require-agent ## Evalúa controles y casos de AGENT=<slug>
	@node tools/ops.js evaluate "$(AGENT)"

require-team:
	@test -n "$(TEAM)" || (echo "Falta TEAM=<slug>" >&2; exit 2)

team-check: require-team ## Valida contrato, agentes y etapas de TEAM=<slug>
	@node tools/ops.js team check "$(TEAM)"

team-show: require-team ## Muestra el recorrido de TEAM=<slug>
	@node tools/ops.js team show "$(TEAM)"

install-claude: ## Instala hooks y workflows para Claude
	@node tools/ops.js automation install . claude

install-codex: ## Instala hooks para Codex
	@node tools/ops.js automation install . codex

install-gemini: ## Instala contexto, comandos y configuración para Gemini
	@node tools/ops.js automation install . gemini

install-antigravity: ## Instala el plugin Cauce para Antigravity CLI
	@node tools/ops.js automation install . antigravity

doctor-claude: ## Diagnostica la instalación de Claude
	@node tools/ops.js automation doctor . claude

doctor-codex: ## Diagnostica la instalación de Codex
	@node tools/ops.js automation doctor . codex

doctor-gemini: ## Diagnostica la instalación de Gemini
	@node tools/ops.js automation doctor . gemini

doctor-antigravity: ## Diagnostica la instalación de Antigravity CLI
	@node tools/ops.js automation doctor . antigravity
