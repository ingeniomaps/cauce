---
caso: 230
titulo: en `-p`, `claude` corta a los 600 s el recorrido que escribe la propuesta y sale en cero
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.100.0
---

# 230 — En `-p`, `claude` corta a los 600 s el recorrido que escribe la propuesta

**🟢 resuelto en 0.100.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: con el caso 219 arreglado, el ensamblaje deja sin decidir a todo cargo cuyo `/agent-propose`
tarde más de diez minutos. En la primera corrida completa fueron 15 de 53.

## Resumen

El job `propose` corre `claude -p "/agent-propose $AGENT"`. El modelo lanza el recorrido en segundo plano, y
en modo `-p` `claude` espera lo que quedó en segundo plano durante **600 s**. Pasado ese tiempo lo corta y sale
en cero. La propuesta queda en «por definir».

El paso `Check the proposal again` del caso 219 lo detecta bien y pone el job en rojo después de empujar los
sellos. Lo que falta es que la espera alcance.

## Reproducción

La corrida que lo mostró: `36927416208` (`workflow_dispatch`, `phase=propose`, sobre `84151b1`). Para
reproducirlo sin CI se usa la misma versión del CLI, `npx @anthropic-ai/claude-code@2.1.233`, en un banco con un
recorrido cuyo agente tarda más que el techo, y se baja el techo para no esperar diez minutos:

```bash
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=20000 npx -y @anthropic-ai/claude-code@2.1.233 \
  --permission-mode acceptEdits --allowedTools 'Workflow' 'Bash(sleep 60)' 'Write' \
  -p "Lanzá el workflow probe en segundo plano y esperá su resultado." </dev/null
```

## Síntoma

En el runner, en `propose (analytics-engineer)` y en los otros 14:

```
Credencial: suscripción (CLAUDE_CODE_OAUTH_TOKEN).
Background tasks still running after 600s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.
Launched the `agent-propose` workflow for `analytics-engineer` in the background — it'll run through the Contexto and Proponer phases and notify me when done.
##[error]analytics-engineer queda en «por definir»: /agent-propose corrió y la propuesta sigue sin decidir; …
```

Los 15 jobs en rojo duraron entre 10,3 y 10,6 min, y los 38 en verde terminaron antes de los 10. Los 15 son
content-specialist, data-governance-steward, analytics-engineer, implementation-manager, legal-counsel,
logistics-operations-manager, mlops-engineer, mobile-engineer, machine-learning-engineer, product-manager,
release-manager, qa-engineer, product-marketing-manager, software-architect y treasury-analyst.

En el banco, con el techo en 20 s:

```
Background tasks still running after 20s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.
exit=0 t=40s out.txt=NO
```

Con el techo en 120 s no hubo corte (t=93 s).

## Causa raíz

- `.github/workflows/agent-learning.yml`, paso `Write the concrete change`: no declara
  `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`, así que rige el default de 600 s.
- El default no está en ninguna página consultada. El valor sale del mensaje del propio CLI
  (**verificado**, versión 2.1.233, en la corrida y en el banco).
- `timeout-minutes: 15` del job: aunque se subiera el techo, el job lo cortaría antes, y se perdería el push de
  los sellos.

## Fix propuesto

- `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '1500000'` (25 min) en el paso.
- `timeout-minutes: 40` en el job.

No se pone `0`, que espera indefinidamente: un recorrido colgado tiene que terminar antes que el job, para que
`Check the proposal again` lo lea y los sellos se empujen igual.

## Tradeoffs

- 25 minutos no salen de una distribución medida: de lo que tarda un recorrido sólo se sabe que 15 pasaron de 10.
  Si alguno pasa de 25, el job sale en rojo con los sellos empujados, que es el mismo modo de fallo de hoy pero
  más lejos.
- Un ensamblaje completo tarda más: con 5 en paralelo, 15 cargos lentos agregan del orden de media hora.

## Contexto de descubrimiento

Es la corrida de los 53 cargos que se lanzó para recuperar el ensamblaje del 2026-10-01, después de cerrar el
219. El cierre del 219 había dejado anotado que un cargo tardó 9 min 23 s y que esta corrida lo mediría: lo midió.

## Relacionados

- **219**: el arreglo que dejó correr el recorrido, y el rojo que hizo visible este caso.
- **220**: para volver a correr los 15 cargos hay que borrar sus ramas.

## Cierre

**🟢 resuelto en 0.100.0** · `.github/workflows/agent-learning.yml`, `test/repo/ci-propose.test.js` · PR #682.

Como en el 219, el workflow no viaja en el paquete: rige desde el merge a `main`.

### La prueba

Se relanzó `phase=propose` sólo para `software-architect`, sobre `74c4225` (el merge de #682). Es el cargo
que más había tardado antes de cortarse (10,6 min). Corrida `36951367180`, `success`:

```
Write the concrete change          success  01:32:11 → 01:46:25   (14 min 14 s)
Check the proposal again           success
Open proposal pull request         success  https://github.com/ingeniomaps/cauce/pull/684
Fail when the proposal run failed  skipped
```

Pasó los 600 s sin que `claude` lo cortara, y la propuesta quedó decidida. El rojo previo es la corrida
`36927416208`, en la que ese mismo cargo se cortó a los 10,6 min.

### Contra lo que el caso enumeró

- **Techo de 25 min en el paso** — **se hizo.** Que la variable se respeta se verificó en el banco con un techo de
  20 s. Que se respeta en el runner lo muestra esta corrida.
- **`timeout-minutes: 40` en el job** — **se hizo.** La corrida usó 14 min 42 s del job.
- **Tradeoff «25 minutos no salen de una distribución medida»** — sigue en pie. Hay un dato más, 14 min 14 s, y no
  hay distribución. Los otros 14 cargos que se cortaron se están corriendo uno por uno: si alguno pasa de 25 min,
  sale en rojo con los sellos empujados y se abre como caso propio.
- **Tradeoff «un ensamblaje completo tarda más»** — **se aceptó.**

