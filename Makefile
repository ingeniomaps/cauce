.DEFAULT_GOAL := help

# Los gates delegan en `package.json`: ese nombre lo tienen fijo `ci.yml`, `verify` y `prepublishOnly`.
.PHONY: help check tree context test coverage coverage-update ci automation-check integration-check
.PHONY: release-check dead-imports
.PHONY: require-agent agent-learn agent-propose agent-evaluate require-flow flow-check flow-show
.PHONY: eval-workflows

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

# Renderiza los workflows de evaluación en `.claude/workflows/`, que es de donde una sesión arma su
# registro: `workflow()` resuelve por nombre contra ahí, y `flow-eval` compone `flow`.
#
# **El registro se arma al abrir la sesión, así que después de correr esto hay que abrir una nueva.**
# Por qué se renderiza en vez de instalar, y por qué la copia va gitignoreada, en «Correr un workflow
# acá» de `AGENTS.md`.
EVAL_WORKFLOWS = flow flow-eval agent-eval

eval-workflows: ## Renderiza los workflows de evaluación en .claude/workflows (gitignorado)
	@mkdir -p .claude/workflows
	@node -e 'const {render}=require("./engine/automation"),fs=require("fs"),path=require("path");const root=process.cwd(),auto=path.join(root,"automatization");for(const n of process.argv.slice(1)){const out=render(path.join(auto,"workflows",n+".js"),"",auto,root);if(out.includes("{{INCLUDE:"))throw new Error(n+": quedaron includes sin expandir");fs.writeFileSync(path.join(root,".claude/workflows",n+".js"),out);console.log("  "+n+".js")}' $(EVAL_WORKFLOWS)
	@printf '\nListo. Abrí una sesión nueva —el registro se arma al abrirla— y evaluá:\n'
	@printf '  /flow-eval {"flow":"<slug>","cases":"<caso>"}\n'
	@printf '  /agent-eval {"agent":"<slug>","cases":"<caso>"}\n'
