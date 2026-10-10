---
caso: 344
titulo: init embebido conserva un AGENTS.md propio y deja contract sin salida
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.104.1
---

# 344 — `init --mode embedded --force` conserva un `AGENTS.md` propio en silencio, `contract` falla y manda a `upgrade`, que tampoco lo repone

**🟢 resuelto en 0.106.0** · detectado en 0.104.1 · prioridad **baja**.

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

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente y la reproducción se corrió de nuevo sobre 0.105.0, con el motor del
repositorio en vez del paquete instalado: misma salida, `contract` con exit 2. Una cosa que el enunciado
no decía:

- **El tercer mensaje se contradice solo, y sale con exit 0.** `upgrade` imprime a la vez «movelos ahí
  antes de repetir con --force» —`engine/cli/upgrade-report.js:63-65`— y, dos líneas después, «Para tomar
  la versión nueva y descartar la tuya, repetí con --force». Quien llega desde `contract` lee las dos y el
  comando terminó bien, así que nada le dice que la instancia sigue sin contrato.

## Cierre

**Resuelto en 0.106.0** con los dos mensajes que el caso proponía. No cambia ninguna conducta: `init`
conserva el archivo igual y `contract` falla igual.

**Valor**: bajo, como decía la prioridad; son tres comandos menos para llegar a la salida. **Riesgo que se
tomó**: nombrar `--force` invita a pisar. Por eso el mensaje dice las dos cosas que `--force` hace, no una.

### El recorrido de lo que este caso enumeró

- **Fix 1, `init --force` lo dice — se hizo distinto.** No mira una lista de archivos: después de crear la
  instancia pregunta qué secciones requeridas faltan, con la misma lista que usa `contract`, y avisa por
  cada una. Así un archivo requerido que se agregue mañana queda cubierto sin tocar `init`.
- **Fix 2, `contract` dice `upgrade --force` y dónde va lo propio — se hizo.** `organization/workspace.md`
  se nombra sólo para `AGENTS.md`, que es de quien se sabe a dónde va lo propio.
- **Tradeoff «alguien pisa un `AGENTS.md` propio sin fusionarlo» — acotado, y con un agregado.** El caso
  decía que alcanzaba con nombrar `organization/workspace.md`. Al comprobar la salida apareció que `--force`
  no distingue: descarta **todas** las ediciones que `upgrade` lista como conservadas, no sólo ese archivo.
  El mensaje lo dice.
- **Lo que la revisión agregó, el tercer mensaje que se contradice — no se tocó.** `upgrade` sigue diciendo
  «movelos antes de repetir con --force» y «repetí con --force» en la misma salida. Los dos son ciertos y el
  orden es el correcto; lo que faltaba era llegar ahí sabiendo por qué, y eso lo dicen ahora los otros dos.

### Qué se corrió

La reproducción del caso, entera y con el motor cambiado:

```
! AGENTS.md se conservó y no trae la sección ## Autonomía: hasta que la tenga, `ops contract` falla y los
  agentes no reciben contrato. Ese archivo lo mantiene Cauce entero, y `ops upgrade` conserva el tuyo si lo
  editaste o ya estaba: lo repone `ops upgrade --force`, que también descarta las demás ediciones que
  `upgrade` liste como conservadas. Lo propio de ese archivo va antes a `organization/workspace.md` …
AGENTS.md no tiene la sección ## Autonomía, y de ahí sale el contrato que reciben los agentes. Ese archivo
  lo mantiene Cauce entero, … lo repone `ops upgrade --force` …
exit=2
```

Y la salida que nombran, comprobada antes de escribirla: `upgrade . --force` devolvió «− descartado tu
cambio en AGENTS.md» y `contract` salió con 0.

- `test/planning/contract.test.js` recorre los cuatro comandos —`init`, `contract`, `upgrade --force`,
  `contract`— y fija que un `init` sobre un directorio vacío no avisa nada.
- Tres mutaciones, cada una en rojo: la frase vieja devuelta, `init` sin el aviso, y el mensaje sin `--force`.

## Contexto de descubrimiento

Campaña de prueba de punta a punta del 2026-10-08, variantes de `init`. Se decidió no trabajarlo en esa
tanda por valor, y registrarlo para abrirlo con el primer caso de `init` o de `contract`.

## Relacionados

- 308, actualizar sin reinstalar el runner: el otro mensaje de `upgrade` que se lee tarde.
