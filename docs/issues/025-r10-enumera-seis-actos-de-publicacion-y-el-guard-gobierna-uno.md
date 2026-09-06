---
caso: 025
titulo: R10 enumera seis actos de publicación y el guard gobierna uno; amend no lo mira nadie
estado: resuelto
prioridad: alta
version-detectada: 0.60.1
resuelto-en: 0.61.0
---

# 025 — La autorización de publicación cubre `push` y nada más

**🟢 resuelto en 0.61.0** · detectado en 0.60.1 · prioridad **alta** — se autoriza publicar y se habilita reescribir historia

## Resumen

R10 dice que «push, PR, merge, tags, deploy y rollback requieren la autorización configurada para el
proyecto». El guard `destructive` comprueba **uno**: `git push`, contra `runner.allowPush`. Los otros
cinco pasan siempre.

Y el que sí comprueba no distingue lo que la prosa distingue. `\bgit\s+push\b` matchea igual
`git push` que `git push --force`, así que autorizar la publicación autoriza también reescribir historia
publicada — que `AGENTS.md` prohíbe en la misma línea donde nombra el push.

`git commit --amend` no lo mira ningún guard: R8 lo prohíbe, `AGENTS.md` lo prohíbe, y no hay una sola
línea del motor que lo comprueba.

## Reproducción

Una raíz mínima —un directorio con `ops.config.json` y `planning/`, que es lo que busca `findOpsRoot`
(`engine/hooks/input.js:113-124`)— y el grupo `pre-shell` con `allowPush` en cada valor:

```bash
mkdir -p raiz/planning
cat > raiz/ops.config.json <<'EOF'
{"project":"demo","mode":"sidecar","workspaceRoots":[{"name":"main","path":"."}],
 "runner":{"maxTaskHours":4,"humanCheckpointBetweenMilestones":true,"commitPerTask":true,"allowPush":true}}
EOF

for cmd in "git push origin main" "git push --force origin main" "git commit --amend -m x" \
           "gh pr create --fill" "gh pr merge 12 --squash" "git tag -a v9.9.9 -m x"; do
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$cmd" \
    | CLAUDE_PROJECT_DIR="$PWD/raiz" node <ruta>/engine/hooks/run.js pre-shell >/dev/null 2>&1
  echo "exit=$? — $cmd"
done
```

Repetir con `"allowPush":false`.

## Síntoma

| comando | `allowPush: false` | `allowPush: true` |
|---|---|---|
| `git push origin main` | 2 | 0 |
| `git push --force origin main` | 2 | **0** |
| `git push --force-with-lease origin main` | 2 | **0** |
| `git commit --amend -m x` | **0** | 0 |
| `gh pr create --fill` | **0** | 0 |
| `gh pr merge 12 --squash` | **0** | 0 |
| `git tag -a v9.9.9 -m x` | **0** | 0 |

`grep -rn "amend" engine/hooks/` no devuelve ninguna línea.

## Causa raíz

`engine/hooks/shell.js:15-18`, en `destructive`:

```js
if (/\bgit\s+push\b/.test(command) && !pushAllowed(input)) {
  block("'git push' publica cambios y requiere una acción humana. Se habilita con runner.allowPush.")
}
```

Una regla, un verbo, un interruptor. `pushAllowed` (`engine/hooks/input.js:106-111`) es booleano y no
tiene forma de decir «publicar sí, reescribir no», que es la distinción que R10 y `AGENTS.md` hacen.
El resto de la lista de R10 no aparece en ningún patrón del guard.

No es un olvido de escritura: cuando se agregó `allowPush` el comentario cita a R10 por la parte que
resolvía —«la autorización configurada para el proyecto»— y esa parte quedó bien. Lo que no se hizo fue
volver sobre la enumeración para ver qué más nombraba.

## Fix propuesto

Tres piezas, y conviene decidirlas por separado porque tienen costos distintos.

1. **Separar force de push.** La forma barata es negar `--force`/`-f`/`--force-with-lease` aunque
   `allowPush` esté prendido, con su propio mensaje: reescribir historia publicada no es publicar. Es la
   única de las tres que cierra un agujero real hoy.
2. **Comprobar `amend`.** R8 lo prohíbe sin excepción configurable, así que es un patrón más en la tabla
   de `destructive`, al lado de `git reset --hard`. Cuidado con el falso positivo: `--amend` sobre un
   commit que nadie vio es lo que el propio `/commit` prohíbe por política, no por daño, así que el
   mensaje tiene que mandar a hacer un commit nuevo.
3. **Decidir qué pasa con PR, merge, tags y deploy.** Acá la respuesta puede ser «no se gobiernan por
   comando» y quedar escrita: `gh pr create` no publica código que no esté ya empujado, y un deploy no
   tiene una forma reconocible. Si se decide eso, lo que hay que arreglar es **R10**, que enumera seis y
   promete una autorización para las seis.

Las tres juntas no son un solo cambio. La 1 y la 2 son patrones con su prueba; la 3 es una decisión
sobre una regla del sistema que baja a todos los consumidores.

## Tradeoffs

Negar `--force` con `allowPush` prendido va a molestar a quien lo usaba: hoy funciona, y el día que se
arregle deja de funcionar sin que nadie lo haya pedido. Es la corrección correcta y conviene que salga
con su línea de CHANGELOG diciendo qué hacer —`OPS_GOVERNANCE_OVERRIDE` no aplica acá; haría falta
decidir si `destructive` merece el suyo—.

`git commit --amend` es el más ruidoso de los tres: aparece en flujos legítimos de gente que todavía no
publicó nada. Bloquearlo por política y no por daño es una decisión que ya tomó R8; mecanizarla es
hacerla visible, no endurecerla.

La opción 3 puede terminar en «R10 enumera de más». Eso no es una derrota: una regla que promete una
autorización que nadie comprueba enseña a no creerle al resto de la regla.

## Contexto de descubrimiento

Midiendo el [024](024-los-cuatro-limites-son-seis-y-uno-es-configurable.md) (2026-09-06), que proponía
escribir en `AGENTS.md` que forzar y reescribir historia nunca se habilitan. Antes de aceptar ese texto
se corrió la tabla de arriba, y resultó que `allowPush: true` los habilita a los dos. El caso 024 se
corrigió; el defecto del motor que lo destapó es éste.

Vale como recordatorio de para qué se verifica un fix propuesto antes de aplicarlo: el texto era
plausible, coincidía con lo que la regla dice, y habría dejado escrito en el documento de cada
consumidor un límite que el motor no sostiene.

## Relacionados

- [024](024-los-cuatro-limites-son-seis-y-uno-es-configurable.md) — la mitad de documentación. Acá el
  motor, allá lo que el documento promete mientras tanto.
- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el otro caso donde `pre-shell` no mira
  algo que su prosa dice mirar. No comparten causa: allá falta un guard, acá le falta alcance a uno.
