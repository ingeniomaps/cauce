.DEFAULT_GOAL := help

# Los gates delegan en `package.json`: ese nombre lo tienen fijo `ci.yml`, `verify` y `prepublishOnly`.
.PHONY: help check tree context test coverage coverage-update ci automation-check integration-check
.PHONY: release-check dead-imports
.PHONY: require-agent agent-learn agent-propose agent-evaluate require-flow flow-check flow-show
.PHONY: eval-instance

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

dead-imports: ## Busca imports que ninguna suite usa (~90s, fuera de ci)
	@npm run --silent dead-imports

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

require-flow:
	@test -n "$(FLOW)" || (echo "Falta FLOW=<slug>" >&2; exit 2)

flow-check: require-flow ## Valida contrato, agentes y etapas de FLOW=<slug>
	@node engine/cli/ops.js flow check "$(FLOW)"

flow-show: require-flow ## Muestra el recorrido de FLOW=<slug>
	@node engine/cli/ops.js flow show "$(FLOW)"

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

# Evaluar un recorrido o un cargo exige dos cosas que no se pueden tener a la vez en este repositorio:
# `flow-eval` frena si el root no es `mode: toolkit`, y `install` se niega a instalar en uno que lo sea.
# La salida es una copia desechable del arbol de trabajo: sigue siendo toolkit, asi que la evaluacion
# acepta, y no es este repositorio, asi que instalar ahi no rompe la regla de `AGENTS.md`.
#
# Se mide el arbol de trabajo, no lo publicado ni lo committeado: la copia sale de rsync, con lo que
# tengas sin commitear. El veredicto se escribe aca, junto al cargo o al recorrido; la copia se tira.
EVAL_DIR ?= /tmp/cauce-eval

eval-instance: ## Prepara una copia instalable del arbol para correr /flow-eval y /agent-eval
	@rm -rf "$(EVAL_DIR)"
	@rsync -a --exclude=.git --exclude=node_modules --exclude=.cauce-eval \
	  --exclude=.env --exclude=.npmrc --exclude=.gitconfig ./ "$(EVAL_DIR)/"
	@sed -i 's/"mode": "toolkit"/"mode": "embedded"/' "$(EVAL_DIR)/ops.config.json"
	@node engine/cli/ops.js automation install "$(EVAL_DIR)" claude
	@sed -i 's/"mode": "embedded"/"mode": "toolkit"/' "$(EVAL_DIR)/ops.config.json"
	@printf '\nInstancia lista en %s\n' "$(EVAL_DIR)"
	@printf 'Abri una sesion ahi y evalua:\n'
	@printf '  /flow-eval {"flow":"<slug>","cases":"<caso>"}\n'
	@printf '  /agent-eval {"agent":"<slug>","cases":"<caso>"}\n'
	@printf 'El veredicto se escribe en este repositorio, no en la copia. La copia se tira.\n'
