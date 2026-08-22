.DEFAULT_GOAL := help

# Los gates delegan en `package.json`: ese nombre lo tienen fijo `ci.yml`, `verify` y `prepublishOnly`.
.PHONY: help check tree context test coverage coverage-update ci automation-check integration-check
.PHONY: release-check
.PHONY: release-check require-agent agent-learn agent-propose agent-evaluate require-team team-check team-show

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

# Comprueba lo que `npm publish` va a exigir y se detiene antes de publicar. El publish no se envuelve a
# propósito: el guard de dependencias bloquea `npm publish` por su nombre, y un `make publish` no matchea
# ese patrón —lo dejaría pasar sin que nada lo diga—. La autorización de R10 es por operación y humana.
release-check: ## Comprueba todo lo que publicar exige — no publica
	@set -a; [ -f .env ] && . ./.env; set +a; \
	if [ -z "$$NPM_TOKEN" ]; then \
	  echo "Falta NPM_TOKEN: .npmrc lo expande del entorno, no del archivo." >&2; \
	  echo "Corre 'set -a; . ./.env; set +a' o exportalo. Los nombres estan en .env.example." >&2; \
	  exit 2; \
	fi; \
	npm run --silent ci || exit $$?; \
	npm pack --dry-run 2>&1 | tail -4; \
	printf '\nTodo verde para %s. El publish lo corre una persona:\n' "$$(npm pkg get version | tr -d '\"')"; \
	printf '  set -a; . ./.env; set +a; npm publish\n'
