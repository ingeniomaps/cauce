---
caso: 219
titulo: el job que consolida llama a `claude` sin instalarlo, y los 53 fallos salen en verde
estado: abierto
prioridad: alta
version-detectada: 0.99.2
---

# 219 — El ensamblaje del 1 llama a `claude` sin instalarlo, y los 53 fallos salen en verde

**🔴 abierto** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: es el primer ensamblaje desde que el job escribe el cambio concreto (caso 155), y no
produjo ninguna propuesta firmable. Además lo hizo con la corrida en verde: sin abrir los logs, el mes se ve
igual que uno sin nada que proponer.

## Resumen

El paso `Write the concrete change` del job `propose` (`.github/workflows/agent-learning.yml:868`) invoca
`claude -p "/agent-propose $AGENT"`, pero ese job no instala el CLI. El único
`npm install -g @anthropic-ai/claude-code` del workflow está en el job `research` (`:220`), y el día del
ensamblaje ese job se saltea. En el runner, `env claude` falla con `No such file or directory` dos veces: una
con la suscripción y otra con la API key de respaldo.

El paso trata cualquier fallo de la corrida como degradación y no como error. Avisa con `::notice`, sale en
cero, y el job empuja la rama con los sellos y sin PR. Así, un defecto de configuración que afecta a todos
los cargos por igual se ve exactamente como un cargo al que se le cayó la credencial un día.

## Reproducción

El cuerpo del paso, tal como está en el workflow, ejecutado con un `PATH` sin `claude` y credenciales de
relleno (no llega a usarlas). Corre desde la raíz del repositorio porque renderiza
`automatization/workflows/agent-propose.js`, y escribe sólo en `.claude/workflows/`, que está gitignoreado.

```bash
node -e 'const {workflow,workflowStep}=require("./test/support/environment")
  process.stdout.write(workflowStep(workflow("agent-learning"),"- name: Write the concrete change"))' > /tmp/step.sh
P="$(dirname "$(command -v node)"):/usr/bin:/bin"
env -i PATH=$P HOME=$HOME AGENT=backend-engineer OAUTH=x APIKEY=y bash -e /tmp/step.sh; echo "exit=$?"
```

## Síntoma

La reproducción local, el 2026-10-01 sobre `origin/main` en `6b3dff56`:

```
Credencial: suscripción (CLAUDE_CODE_OAUTH_TOKEN).
env: 'claude': No such file or directory
La corrida con la suscripción falló.
Reintento con ANTHROPIC_API_KEY, que se factura por token.
env: 'claude': No such file or directory
::notice title=Propuesta sin completar::backend-engineer queda en «por definir»: la corrida de /agent-propose falló. La rama se empuja igual con los sellos.
exit=0
```

En producción es la corrida `36876344492` (`schedule`, 2026-10-01 14:26 UTC, `conclusion=success`). El log del
job `propose (backend-engineer)` dice lo mismo, línea por línea. Las anotaciones de la corrida suman:

- **53** «la corrida de /agent-propose falló», una por cada cargo que consolidó;
- **53** «Sin cambio decidido», con su rama `automation/<cargo>-2026-10` empujada (`git ls-remote` cuenta 53);
- **7** «Nada que proponer», de los recorridos, que es lo correcto: `propose-flows` no corre ningún modelo;
- **0** PR de propuesta abiertos.

## Causa raíz

- `.github/workflows/agent-learning.yml:220`: `Install Claude Code` existe sólo en el job `research`.
- `.github/workflows/agent-learning.yml:868-919`: `Write the concrete change`, en el job `propose`, llama a
  `claude` sin que nada lo haya instalado. `bf966426` (2026-09-15, caso 155) agregó el paso y copió la
  resolución de credenciales del job `research`, pero no su instalación.
- `.github/workflows/agent-learning.yml:917-919`: un fallo de la corrida termina en `::notice` y `exit 0`.
  Ése es el trato que el caso 155 decidió para la **falta de credencial** (el ciclo degrada al estado
  anterior). Acá se extiende a cualquier fallo, incluido el que no depende del día.

Ninguna prueba lo atrapaba porque las que cubren el paso (`test/repo/ci-schedule.test.js:438-476`) asercian
estructura: que el paso exista, su condición, su orden y el orden de las credenciales. Ninguna corre el
paso, y ninguna mira qué hay instalado en el job.

## Fix propuesto

1. **Instalar el CLI en `propose`**, con la misma condición que el paso que lo usa. La versión se declara una
   sola vez en el `env` del workflow y la leen los dos jobs: copiada, una de las dos se queda atrás en el
   próximo bump y nada falla.
2. **Que la corrida fallida ponga el job en rojo, después de empujar los sellos.** El paso sigue sin frenar,
   así que la rama sale igual y el material consumido no vuelve a entrar. Lo que cambia es que deja
   `failed=true` en su salida, y un último paso falla el job con `::error`. Sin credencial sigue siendo
   `::notice` y verde, como decidió el 155: ahí el ciclo degrada a propósito.

```yaml
env:
  OPS: engine/cli/ops.js
  CLAUDE_CODE_VERSION: 2.1.233
…
      - name: Install Claude Code
        if: steps.proposal.outputs.decided != 'true'
        run: npm install -g "@anthropic-ai/claude-code@$CLAUDE_CODE_VERSION"
      - name: Write the concrete change
        id: write
        …
          if ! proponer … claude; then
            echo "failed=true" >> "$GITHUB_OUTPUT"
          fi
…
      - name: Fail when the proposal run failed
        if: steps.write.outputs.failed == 'true'
        run: |
          echo "::error title=Propuesta sin completar::…"
          exit 1
```

## Tradeoffs

- El job `propose` tarda unos segundos más por cargo sin decidir, por el `npm install`. Los cargos que ya
  vienen decididos no instalan nada.
- Una caída transitoria de la API pone la corrida en rojo aunque el resto haya salido bien. Es lo que se
  busca: el ensamblaje corre una vez al mes, y un rojo de más cuesta una mirada, mientras que un verde que
  miente costó este mes entero.

## Contexto de descubrimiento

Se preguntó si había corrido «lo que Cauce esperaba que corriera el 1 de cada mes». La lista de corridas
decía `success`, y lo que faltaba se vio recién al contar anotaciones y PR.

Es la primera vez que el paso corre de verdad: entró el 2026-09-15 y el ensamblaje es mensual. El cierre del
155 lo probó por estructura y no lo corrió, que es justo el hueco que dejó pasar esto.

## Relacionados

- **155**, que agregó el paso. Este caso es lo que su cierre no probó.
- **220**, que es lo que encuentra quien relance el ensamblaje para recuperar este mes: las ramas
  `automation/<cargo>-<período>` ya existen y el push se rechaza.
