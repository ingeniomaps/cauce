---
caso: 220
titulo: relanzar el ensamblaje en el mismo mes choca con las ramas que empujó la corrida anterior
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 220 — Relanzar el ensamblaje en el mismo mes choca con las ramas de la corrida anterior

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: con el ensamblaje sano no aparece. Aparece exactamente cuando hace falta repetirlo, que
es el día que algo salió mal. Este mes pasa con los 53 cargos (caso 219).

## Resumen

`Open proposal pull request` hace `git switch -c "automation/$AGENT-$name"` desde `main` y después
`git push origin "$branch"` sin forzar (`.github/workflows/agent-learning.yml:972-978`). Si una corrida
anterior del mismo período ya empujó esa rama, el commit nuevo no desciende del que está en el remoto y el
push se rechaza como `non-fast-forward`. El job falla en ese paso para todos los cargos que la corrida
anterior alcanzó a empujar.

`workflow_dispatch` con `phase=propose` existe justamente para relanzar, así que esto no es un uso raro: es
la única salida documentada para recuperar un mes que falló.

## Reproducción

Un remoto desnudo en un temporal, una rama empujada por la «corrida 1» y otra cortada desde la misma base
con el mismo nombre, que es lo que hace el job en la «corrida 2». Se arma con `commit-tree` para no
necesitar un árbol de trabajo:

```bash
B=$(mktemp -d); git init -q --bare "$B/remote.git"; git init -q "$B/a"
git -C "$B/a" remote add origin "$B/remote.git"
T=$(git -C "$B/a" mktree </dev/null); base=$(git -C "$B/a" commit-tree $T -m base)
r1=$(git -C "$B/a" commit-tree $T -p $base -m "run 1"); r2=$(git -C "$B/a" commit-tree $T -p $base -m "run 2")
git -C "$B/a" push -q origin $base:refs/heads/main $r1:refs/heads/automation/x-2026-10
git -C "$B/a" branch automation/x-2026-10 $r2
git -C "$B/a" push origin automation/x-2026-10; echo "exit=$?"
```

## Síntoma

Corrido el 2026-10-01:

```
 ! [rejected]        automation/x-2026-10 -> automation/x-2026-10 (non-fast-forward)
error: falló el empuje de algunas referencias a '…/pushbench/remote.git'
exit=1
```

## Causa raíz

`.github/workflows/agent-learning.yml:972-978`: la rama se nombra por período y se crea siempre desde cero,
sin mirar si ya existe en el remoto. Los sellos de la corrida anterior viven sólo en esa rama, no en `main`,
así que la corrida nueva vuelve a consolidar el mismo material. Eso está bien. Lo que no tiene es un destino
donde dejarlo.

## Fix propuesto

Está abierto, y hay que decidirlo antes de construir:

1. **`--force-with-lease` sobre la rama del bot.** La rama `automation/*` la escribe sólo el workflow, y la
   corrida nueva trae un superconjunto de lo que había. El riesgo es pisar algo que una persona haya
   agregado a mano sobre esa rama, por ejemplo con `/agent-propose` corrido localmente, como sugiere el
   propio aviso.
2. **Saltear el cargo cuya rama ya existe** y avisarlo. Es seguro, pero relanzar deja de servir para
   recuperar un mes.
3. **Dejarlo operativo**: borrar las ramas antes de relanzar, escrito en el `AGENTS.md`. No toca el
   workflow, pero depende de que alguien se acuerde.

## Tradeoffs

La 1 es la que hace que relanzar funcione solo, y es también la única que puede destruir trabajo. La 2 y la
3 no destruyen nada, pero dejan el relanzamiento a mano.

## Contexto de descubrimiento

Apareció al planear cómo recuperar el ensamblaje del 2026-10-01 (caso 219). Este mes se resuelve por la vía 3,
borrando las 53 ramas antes de relanzar. Esas ramas sólo tienen la propuesta en «por definir» y sus sellos,
y las dos cosas se regeneran desde `main`.

## Relacionados

- **219**: el fallo que obliga a relanzar.
