---
caso: 183
titulo: La rama que mergea el auto-merge del bot no se borra nunca, porque su merge no dispara el workflow que la borra
estado: resuelto
resuelto-en: 0.98.0
prioridad: baja
version-detectada: 0.98.0
---

# 183 — El caso 147 se probó con una persona mergeando, y el que mergea es el bot

**🟢 resuelto en 0.98.0** · detectado en 0.98.0 · prioridad **baja**. Las ramas de los informes `propone: no`
sobreviven a su merge, y el workflow que existe para borrarlas nunca se entera.

## Resumen

`delete-merged-branch.yml` escucha `pull_request: closed` y borra la rama del PR cuando el merge
ocurrió. Nació en el caso 147 justamente para cubrir el auto-merge. Pero el auto-merge de los informes
`propone: no` lo arma `agent-learning.yml` con `github.token`, así que el merge lo firma
`app/github-actions`. Para esos merges el workflow **no corre nunca**: la rama queda en el remoto.

El caso 147 lo probó con el #463, que mergeó una persona. La tanda del 2026-09-21 fue la primera de
auto-merges del bot después de ese arreglo, y es la que lo mostró.

## Reproducción

Con la tanda del 2026-09-21 ya mergeada:

```bash
git ls-remote --heads origin 'automation/*'
gh pr view <n> --json mergedBy --jq .mergedBy.login          # para cada rama que quedó
gh run list --workflow delete-merged-branch.yml --limit 30 \
  --json headBranch,conclusion,createdAt
```

## Síntoma

Salida real, el 2026-09-23. Quedaron en el remoto nueve ramas:

```
automation/cloud-architect-research-2026-09-21
automation/data-engineer-research-2026-09-21
automation/database-administrator-research-2026-09-21
automation/devops-engineer-research-2026-09-21
automation/frontend-engineer-research-2026-09-21
automation/machine-learning-engineer-research-2026-09-21
automation/product-manager-research-2026-09-21
automation/security-engineer-research-2026-09-21
automation/site-reliability-engineer-research-2026-09-21
```

Son exactamente las nueve con `propone: no`, que mergeó el bot:

```
#541 merged_by=ingeniomaps branch=automation/ai-product-manager-research-2026-09-21
#543 merged_by=app/github-actions branch=automation/cloud-architect-research-2026-09-21
#548 merged_by=app/github-actions branch=automation/devops-engineer-research-2026-09-21
```

Y las corridas de `delete-merged-branch.yml` del 2026-09-23 son **sólo** las de los ocho PR que mergeó
`ingeniomaps`, además de dos ramas `fix/`. Para las nueve del bot no hay ninguna:

```
2026-09-23T04:15:25Z success automation/mlops-engineer-research-2026-09-21
2026-09-23T04:15:09Z success automation/kyc-aml-specialist-research-2026-09-21
2026-09-23T04:14:54Z success automation/finops-engineer-research-2026-09-21
2026-09-23T04:14:36Z success automation/analytics-engineer-research-2026-09-21
2026-09-23T04:14:20Z success automation/data-governance-steward-research-2026-09-21
2026-09-23T04:14:05Z success automation/backend-engineer-research-2026-09-21
2026-09-23T04:13:49Z success automation/ai-product-manager-research-2026-09-21
2026-09-23T04:13:34Z success automation/qa-engineer-research-2026-09-21
2026-09-23T04:07:20Z success fix/learning-monthly-cadence
2026-09-23T04:02:23Z success fix/archive-reason-reaches-research
```

Las nueve se borraron a mano ese día, después de comprobar que cada una apuntaba al mismo commit con el
que se había mergeado su PR.

## Causa raíz

- **`.github/workflows/agent-learning.yml:713` y `:774`**: el paso «Open research pull request» corre
  con `GH_TOKEN: ${{ github.token }}` y arma `gh pr merge "$branch" --auto --merge`. El merge que
  después ejecuta GitHub queda firmado por `app/github-actions`.
- **`.github/workflows/delete-merged-branch.yml`**: su único disparador es `pull_request: closed`.
- Por qué el evento no llega: **documentado, no verificado acá**. docs.github.com, «Triggering a
  workflow», dice que los eventos disparados con el `GITHUB_TOKEN`, salvo `workflow_dispatch` y
  `repository_dispatch`, no crean corridas nuevas. Lo **verificado** es el síntoma: cero corridas justo
  para los merges del bot. Ojo: el `AGENTS.md` ya advierte que esa misma cita no encaja con lo que se
  observó sobre el CI de estos PR. Allá la corrida sí se crea y espera autorización; acá no se crea
  ninguna. Antes de apoyar el arreglo en esa cita hay que confirmar cuál de las dos lecturas vale para
  `closed`.

## Fix propuesto

La forma que tendría, no una decisión:

1. **Borrar desde el propio ciclo.** `agent-learning.yml` ya corre con permiso de escritura. Al empezar
   cada corrida, sea de investigación o de consolidación, borra las ramas `automation/*` cuyo PR esté
   `MERGED` y cuyo head coincida con el de la rama, con la misma comprobación que se hizo a mano. No
   depende de ningún evento.
2. **Que el auto-merge lo arme una identidad que sí dispara eventos.** Requiere guardar un PAT, que es la
   credencial que `release.yml` y el caso 146 evitan a propósito.
3. **Un barrido periódico en `delete-merged-branch.yml`**, con `schedule`. El caso 147 lo descartó
   porque deja la rama viva un tiempo; con la cadencia mensual (caso 182), el ciclo corre pocas veces al
   mes y la 1 deja la misma ventana sin agregar un cron.

La 1 parece la mínima.

## Tradeoffs

- **La 1 y la 3 dejan la rama viva hasta la corrida siguiente**, que ahora es de semanas. No rompe
  nada: el contenido ya está en `main` y la rama sólo ensucia la lista.
- **Borrar ramas desde un workflow es un borrado.** La comprobación tiene que ser la del destino (R23):
  PR `MERGED` **y** head de la rama igual al head mergeado. Sin la segunda, una rama que alguien reusó
  después del merge se iría con trabajo vivo.

## Prioridad

Baja. No pierde nada ni bloquea nada; ensucia el remoto y confunde al mirar la lista de ramas. Pero es
un caso cerrado (147) que no hace lo que su cierre dice, y eso vale más que el síntoma.

## Contexto de descubrimiento

Después de mergear a mano los ocho PR `propone: si` de la tanda del 2026-09-21, la persona preguntó por
qué quedaban ramas `automation/*` en el remoto.

## Relacionados

- **147**: creó `delete-merged-branch.yml`. Su cierre dice que cubre el auto-merge y lo probó con un
  merge humano. Este caso es la mitad que ese cierre no corrió.
- **146**: por qué los PR del bot no arrancan CI solos, y por qué no se guarda un PAT.
- **182**: la cadencia mensual, que cambia cuánto dura la ventana de la opción 1.

## Cierre

**Resuelto en 0.98.0 por la opción 1.** Recorriendo lo que enumeró:

- **El porqué quedó abierto como «documentado, no verificado» → se consultó la fuente y queda citado.**
  docs.github.com, «Triggering a workflow», consultado el 2026-09-23: los eventos disparados con el
  `GITHUB_TOKEN` no crean corridas, salvo `workflow_dispatch`, `repository_dispatch` y `pull_request`
  en `opened`, `synchronize` o `reopened`, que las crean esperando aprobación. Y: *«Other
  `pull_request` activity types (such as `labeled`, `edited`, or `closed`) do not create workflow
  runs.»*

  Eso también resuelve la duda que el `AGENTS.md` dejaba sobre esa cita. El CI de los PR del bot se
  crea esperando aprobación porque es `opened`; el `closed` del merge no crea nada.
- **Opción 1, borrar desde el propio ciclo → construida.** El job `prune-merged` de
  `agent-learning.yml` corre en cada disparo del ciclo, sin `needs` ni `if`, con `contents: write`.
  Borra una rama sólo si cumple las tres condiciones:
  - es `automation/<algo>`;
  - tiene un PR mergeado;
  - ese PR tiene como head el commit en que la rama está.

  Una rama movida después del merge se nombra y no se toca.
- **Opción 2, armar el auto-merge con un PAT → se decidió que no**, por lo mismo que el 146.
- **Opción 3, un cron en `delete-merged-branch.yml` → se decidió que no.** Agregaba un disparador para
  lo que el ciclo ya hace en cada vuelta.
- **Tradeoff «la rama queda viva hasta la corrida siguiente» → aceptado.** Con la cadencia mensual del
  182 son semanas, y el contenido ya está en `main`.
- **Tradeoff «es un borrado» → cubierto como pide R23**, con la comprobación del destino y no de la
  intención. Ninguna prueba toca un remoto: el paso corre con un `gh` falso que sólo anota.

### Qué se corrió

- **Las nueve ramas del síntoma se borraron a mano** el 2026-09-23, con la misma comprobación que ahora
  hace el job. `git ls-remote --heads origin 'automation/*'` quedó en 0.
- **Las dos consultas del paso, contra el GitHub real y sin borrar nada**, con la identidad del
  proyecto:
  - `matching-refs/heads/automation/` sale con 0 y vacío (no queda ninguna).
  - Sobre un prefijo que existe devuelve `refs/heads/release/0.98.0 89429ce6…`, el formato `ref sha`
    que el paso parsea.
  - `gh pr list --head automation/cloud-architect-research-2026-09-21 --state merged` devuelve
    `25f41701…`, igual al `headRefOid` del #543.
  - Una rama sin PR mergeado devuelve una línea vacía.
- **Prueba nueva en `test/repo/ci-research-report.test.js`**, «el ciclo borra sus ramas ya mergeadas,
  y sólo ésas». Corre el paso tal cual contra cuatro ramas: se borra sólo la mergeada que no se movió,
  la movida se nombra, y la del PR abierto y la de fuera de `automation/` no aparecen. También asercia
  que el job no depende de nada y puede escribir.
- **Cinco mutaciones en una copia del árbol, las cinco en rojo**:
  - Sin comparar el head.
  - Sin el prefijo.
  - Sin exigir el PR mergeado. Ésta sobrevivió la primera vez: no borraba, pero informaba como
    «movida» una rama que nunca se mergeó. Se sumó la aserción de ausencia y quedó en rojo.
  - Sin el `DELETE`.
  - Sin permiso de escritura.
- **La corrida real es la del 24**, primera del ciclo con este job. Ahí se ve si las ramas de los
  `propone: no` de esa tanda desaparecen en la corrida siguiente.

### Prueba real posterior, 2026-09-23

Una corrida real en GitHub Actions, `35863075293`. Se recreó
`automation/cloud-architect-research-2026-09-21` en `25f41701`, el head con que se mergeó el #543, y se
lanzó el workflow con un slug inexistente para que ningún job gastara modelos:

```
discover: failure          ← a propósito, «No existe el agente ni el recorrido»
prune-merged: success
##[notice]automation/cloud-architect-research-2026-09-21, mergeada y sin cambios desde entonces.
```

`git ls-remote --heads origin 'automation/*'` quedó en 0.
