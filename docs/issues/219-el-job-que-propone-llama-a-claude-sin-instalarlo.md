---
caso: 219
titulo: el job que consolida llama a `claude` sin instalarlo, y los 53 fallos salen en verde
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 219 — El ensamblaje del 1 llama a `claude` sin instalarlo, y los 53 fallos salen en verde

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

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

## Lo que encontró la primera prueba real

El arreglo de arriba entró con el PR #640, y se probó corriendo `phase=propose` sólo para `backend-engineer`
(corrida `36923010691`, sobre `f9264bb`). El CLI se instaló y corrió 43 s, `Fail when the proposal run failed`
quedó salteado, el job salió verde y **no se abrió ningún PR**. Había dos defectos más detrás del primero.

**`/agent-propose` no corre en `-p` sin `Workflow` permitido.** Lo que `claude` imprimió en el runner:

```
Intenté lanzar el workflow `agent-propose` para `backend-engineer` (tanto por nombre como por `scriptPath`),
pero la herramienta devuelve `Review dynamic workflow before running` en los tres intentos, sin llegar a
ejecutarse.
```

Se verificó con la misma versión que el workflow (`npx @anthropic-ai/claude-code@2.1.233`), en un banco con un
recorrido de una sola instrucción:

- **Con los `--allowedTools` del job** devuelve `Workflow(name: "probe") → Review dynamic workflow before running`,
  con `exit=0`.
- **Sumando `Workflow`**, el recorrido corre.
- **Con `--allowedTools 'Workflow'` solo**, el agente de adentro escribe `out.txt` con `SUBAGENT-WROTE`. Como la
  sesión principal no tenía `Write`, el que escribió fue el agente.

Esto se comprobó con la configuración de usuario de esta máquina y no con la de un runner vacío. Lo que lo
establece para CI es la corrida real después del merge.

**El job decidía por el código de salida, y el PR leía un veredicto viejo.** `claude` contestó pidiendo
aprobación y salió en cero, así que la primera mitad del arreglo no tenía qué atrapar. Y `Open proposal pull
request` leía `steps.proposal.outputs.decided`, que se calcula **antes** de correr el recorrido: una propuesta
que `/agent-propose` sí completara se habría empujado igual sin PR.

El segundo arreglo:

- suma `Workflow` a `--allowedTools`;
- agrega `Check the proposal again`, que vuelve a preguntarle al documento con `blankProposal` después de
  correr el recorrido;
- hace que el PR y el rojo lean ese veredicto.

Si falta el archivo, el paso responde «sin decidir», porque `blankProposal` da por decidido lo que no puede
leer. Tampoco sale en error: cortar ahí saltearía el push de los sellos.

## Relacionados

- **155**, que agregó el paso. Este caso es lo que su cierre no probó.
- **220**, que es lo que encuentra quien relance el ensamblaje para recuperar este mes: las ramas
  `automation/<cargo>-<período>` ya existen y el push se rechaza.

## Cierre

**🟢 resuelto en 0.100.0** · `.github/workflows/agent-learning.yml`, `test/repo/ci-propose.test.js`,
`test/repo/ci-schedule.test.js` · PR #640 y #641.

El workflow no viaja en el paquete, así que el arreglo rige desde que se mergeó a `main` y no desde que se
publique la versión. 0.100.0 es la que estaba abierta cuando entró.

### La prueba

Se lanzó `phase=propose` sólo para `backend-engineer`, sobre `231e40d` (el merge de #641). Es la corrida
`36925119157`, que terminó en `success`:

```
Install Claude Code              success  20:55:53 → 20:55:56
Write the concrete change        success  20:55:56 → 21:05:19
Check the proposal again         success  21:05:19 → 21:05:19   FILE: …/backend-engineer/learning/proposals/2026-10.md
Open proposal pull request       success  21:05:19 → 21:05:22   https://github.com/ingeniomaps/cauce/pull/642
Fail when the proposal run failed skipped
```

El PR #642 lo abrió `app/github-actions`, de `automation/backend-engineer-2026-10` a `main`. Su diff es la
propuesta (`+198`) y los sellos de los cuatro informes de septiembre (`+1 -1` cada uno), nada fuera del
cargo. «Cambio propuesto» decide algo: ningún cambio de contrato, justificado archivo por archivo. Es una
decisión firmable, no el molde.

Antes de este arreglo, la misma corrida (`36923010691`, sobre `f9264bb`) terminó en verde y sin PR. Ése es
el rojo previo.

### Contra lo que el caso enumeró

- **Fix 1, instalar el CLI en `propose` con la versión declarada una vez** — **se hizo** (#640). En la corrida
  de prueba el paso tardó 3 s.
- **Fix 2, que la corrida fallida ponga el job en rojo después de empujar los sellos** — **se hizo distinto**
  (#641). Como estaba en #640 no alcanzaba: `claude` salía en cero sin haber hecho nada, y el PR leía un
  veredicto de antes de la corrida. Ahora decide el documento, que se vuelve a leer después de correr. La rama
  en rojo no se vio en una corrida real, porque la de prueba salió bien. La sostiene
  `test/repo/ci-propose.test.js` con un `claude` que no escribe nada, y se vio en rojo con cinco mutaciones.
- **Sin credencial sigue siendo aviso** — **se hizo**: la prueba lo cubre y la rama no cambió.
- **Tradeoff «unos segundos más por cargo»** — **medido**: 3 s de instalación.
- **Tradeoff «una caída transitoria pone la corrida en rojo»** — **se aceptó**, como decía el caso.
- **Lo que el caso no preveía.** La primera prueba real encontró los dos defectos que están en «Lo que
  encontró la primera prueba real», y los dos se arreglaron acá. Encontró además un dato que el caso no
  pedía: `/agent-propose` tardó **9 min 23 s** de un `timeout-minutes: 15`. Se midió en la corrida de los 53
  cargos (`36927416208`): 15 se cortaron. El límite no fue el del job sino uno de `claude` en `-p`, que corta a
  los 600 s lo que corre en segundo plano y sale en cero. **Sale como caso propio, el 230.** Que esos 15
  salieran en rojo y no en verde es este arreglo funcionando.
- **Recuperar el mes** — no le toca a este caso. Son 52 cargos con su rama de 2026-10 empujada y la propuesta
  en «por definir». Relanzarlos choca con el caso 220, y se decide aparte.

