---
caso: 344
titulo: init embebido conserva un AGENTS.md propio y deja contract sin salida
estado: abierto
prioridad: baja
version-detectada: 0.104.1
---

# 344 — `init --mode embedded --force` conserva un `AGENTS.md` propio en silencio, `contract` falla y manda a `upgrade`, que tampoco lo repone

**🔴 abierto** · detectado en 0.104.1 · prioridad **baja**.

**Prioridad baja**: sólo pasa en modo embebido, que es la excepción explícita del README, y el daño es una
instancia sin contrato con tres mensajes que no se apuntan entre sí. Vale abrirlo porque le pasa a un
repositorio concreto y previsible: uno que ya usa Codex, que lee `AGENTS.md`, y entra en embebido. Se
registró en la campaña del 2026-10-08 y se abre junto con el primer trabajo que toque `init` o `contract`.

## Resumen

Un repositorio con `AGENTS.md` propio corre `init . --mode embedded --force`. `init` conserva el archivo
—«= conservado …/AGENTS.md»— y termina con «sistema ops creado». Después `contract .` falla con exit 2:
«AGENTS.md no tiene la sección ## Autonomía, y de ahí sale el contrato que reciben los agentes. Ese archivo
lo reemplaza `ops upgrade` entero: corrélo para restaurarlo». Y `upgrade .` lo conserva otra vez —«=
conservado AGENTS.md (editado localmente)»— y manda a repetir con `--force`. Son tres comandos y ninguno
dice `--force` hasta el tercero; mientras tanto los agentes de esa instancia no reciben contrato.

## Reproducción

```bash
mkdir tres && cd tres && git init -q && echo "# mío" > AGENTS.md
node <cauce>/engine/cli/ops.js init . --mode embedded --force --no-install | grep -i agents
npm install --save-dev @ingeniomaps/cauce@0.104.1 >/dev/null
node tools/ops.js contract . ; echo "exit=$?"
node tools/ops.js upgrade . | grep -i "agents\|force"
```

## Síntoma

```
= conservado …/tres/AGENTS.md
AGENTS.md no tiene la sección ## Autonomía, y de ahí sale el contrato que reciben los agentes. Ese archivo lo reemplaza `ops upgrade` entero: corrélo para restaurarlo.
exit=2
= conservado AGENTS.md (editado localmente)
antes de repetir con --force, o los vas a tener que fusionar de nuevo en cada versión.
```

Verificado el 2026-10-08 sobre 0.104.1, dos veces: por un subagente de la campaña y a mano.

## Causa raíz

- `engine/cli/instance.js`, `scaffold` con `--force`: conserva todo archivo existente y lo lista como
  conservado, sin distinguir los que el toolkit mantiene enteros, como `AGENTS.md`, de los del proyecto.
- `engine/cli/contract.js`: ante un `AGENTS.md` sin «## Autonomía» manda a `upgrade` a secas.
- `engine/cli/upgrade-report.js` y el flujo de `upgrade`: un archivo del molde editado localmente se conserva
  y sólo `--force` lo pisa. Ninguno de los tres sabe del otro.

## Fix propuesto

1. `init --force` que conserva un archivo que el toolkit mantiene entero lo dice con la salida: «conservado
   AGENTS.md: sin su sección ## Autonomía los agentes no reciben contrato; repóné el del molde con `upgrade
   --force` o fusioná lo tuyo en `organization/workspace.md`».
2. `contract` dice `upgrade --force` donde hoy dice `upgrade`, y nombra dónde va lo propio.

Dos mensajes; no cambia ninguna conducta.

## Tradeoffs

- Ninguno sobre conducta. El riesgo de decir `--force` es que alguien pise un `AGENTS.md` con contenido
  propio sin fusionarlo; por eso el mensaje nombra `organization/workspace.md`, que es donde ese contenido
  vive y `upgrade` no toca.

## Contexto de descubrimiento

Campaña de prueba de punta a punta del 2026-10-08, variantes de `init`. Se decidió no trabajarlo en esa
tanda por valor, y registrarlo para abrirlo con el primer caso de `init` o de `contract`.

## Relacionados

- 308, actualizar sin reinstalar el runner: el otro mensaje de `upgrade` que se lee tarde.
