---
caso: 502
titulo: Los subagentes que instala `init` no existen en la sesión que lo corrió, y nada dice que haya que abrir otra
estado: resuelto
resuelto-en: 0.120.0
prioridad: alta
version-detectada: 0.119.0
---

# 502 — Los subagentes que instala `init` no existen en la sesión que lo corrió, y nada dice que haya que abrir otra

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **alta**: deja `/autobuild`, el camino principal, muerto en la primera sesión de quien instala Cauce desde el runner, que es como lo instaló la corrida a ciegas del caso 494.

## Resumen

`init --runner claude` instala `.claude/agents/cauce-clerk.md` y `cauce-scribe.md`. Claude Code registra los tipos de agente al arrancar el proceso, así que en la sesión desde la que se corrió `init` esos tipos no existen, y el primer `agent({ agentType: 'cauce-clerk' })` de `/autobuild` aborta el recorrido. Ni `init`, ni `automation install`, ni el README dicen que haya que abrir una sesión nueva. La salida de `install` dice lo contrario para los workflows: «los encuentra por nombre una sesión abierta».

## Reproducción

Sonda con Claude Code 2.1.323 y Haiku, en un directorio desechable con git y un agente de una línea (`name: probe-494`):

1. Una sesión interactiva en tmux: invocar `Agent` con `subagent_type: probe-494` → no existe (esperado).
2. Con la sesión abierta, crear `.claude/agents/probe-494.md` desde afuera.
3. Mismo pedido en el turno siguiente de la misma sesión.
4. El mismo pedido en un proceso nuevo: `claude -p` en el directorio, y `claude -p --resume <id>` sobre la sesión de `-p`.

También se probó en un solo turno de `claude -p` que espera al archivo con `until [ -f … ]` antes de invocar.

## Síntoma

Paso 3, en la sesión interactiva, con el archivo creado a las 15:40:13:

```
Agent type 'probe-494' not found. Available agents: architecture-reviewer, claude, claude-code-guide, Explore, …
```

Paso 4, proceso nuevo y `--resume`: `PROBE-OK` en los dos.

En la corrida a ciegas (`/var/tmp/ciego-494`, Claude Code 2.1.318), el `.jsonl` lo muestra igual. `init` imprime `✓ claude: instalado .claude/agents/cauce-clerk.md` a las 20:05:44. `/autobuild` muere a las 20:08:27:

```
failed: Error: agent({agentType}): agent type 'cauce-clerk' not found. Available agents: claude, Explore, general-purpose, Plan, statusline-setup, web-fetch
```

Los tipos aparecen recién a las 20:12:24 (`agent_listing_delta`, `addedTypes: ["cauce-clerk", "cauce-scribe"]`), en la reanudación con `--resume`, que es un proceso nuevo. El informe de esa corrida dice que «más tarde aparecieron solos», y la sonda lo desmiente: no aparecen en la sesión que sigue abierta, ni en su turno siguiente.

## Causa raíz

- Mecanismo del runner, **verificado** en 2.1.323 con la sonda de arriba: los tipos de agente se leen al arrancar el proceso.
- `engine/cli/wiring.js:202-204`: el cierre de `init` dice «Abrí claude acá y contestale esa pregunta». No distingue entre una sesión ya abierta y una nueva.
- `engine/automation/index.js:405`: `install` imprime que los workflows «los encuentra por nombre una sesión abierta». Es cierto para los workflows (`/autobuild` arrancó) y no para los agentes que esos workflows necesitan.
- `README.md:120-124` dice dónde se abre la sesión, no cuándo.

## Fix propuesto

1. `automation install` (y por él `init`), cuando instala agentes y corre dentro de una sesión de Claude Code, cierra con una línea propia: «Esta sesión se abrió antes de instalar: los subagentes de Cauce no existen en ella hasta que abras una nueva en <ruta>». Lo detecta con `CLAUDECODE=1`, que Claude Code exporta a los comandos que corre (**verificado** con `env` en esta sesión: `CLAUDECODE=1`, `CLAUDE_CODE_ENTRYPOINT=cli`).
2. La línea de los workflows en `index.js:405` deja de decir «una sesión abierta» cuando hay agentes en la misma instalación.
3. El README, en «El primer ciclo», dice que después de `init` se abre una sesión nueva.
4. Prueba: con `CLAUDECODE=1` la salida de `install claude` trae la línea; sin la variable no la trae. Mutación: sacar la condición pone roja la segunda aserción.

## Tradeoffs

- **Los otros runners no están medidos.** Codex ya pide abrir sesión para confiar los hooks (`engine/cli/wiring.js:288`). Gemini y Antigravity pueden registrar distinto, y la línea no se les extiende sin medirlos.
- **`CLAUDECODE` no es una interfaz documentada.** Si cambia de nombre, la línea deja de salir y no falla nada. La prueba fija el nombre, y el README cubre el caso igual.
- Quien corre `init` desde una terminal suelta no ve nada nuevo.

## Contexto de descubrimiento

Paso 6 del informe de la corrida a ciegas del caso 494 (2026-11-05). Contrastado contra su `.jsonl` y medido con la sonda el 2026-11-13.

## Relacionados

- 494, de donde sale.
- 503: la misma sesión abierta antes de `init` tampoco tiene registrado el pedido de la persona. El remedio de abrir una sesión nueva sirve para los dos, y conviene construirlos juntos.

## Cierre

`automation install` (y por él `init`) termina con una línea propia cuando corre dentro de una sesión de Claude Code e
instaló algo que esa sesión no tiene:

```
! claude: esta sesión se abrió antes de instalar: los subagentes de Cauce no existen en ella, y lo que la persona pidió antes no quedó registrado para los guards. La persona tiene que abrir una nueva en <ruta> y repetir ahí su pedido.
```

La condición está en el manifiesto del runner (`startup: { env: "CLAUDECODE", dir: ".claude/agents" }`), así que los
otros runners no la heredan. La mitad de los subagentes sale sólo si algún archivo de `.claude/agents/` se instaló
`nuevo`. La mitad del registro sale sólo si la configuración que había no traía el hook de mensaje, y es la mitad que
toma del caso 503. El cierre de `init` pasa a «→ Abrí una sesión nueva de claude acá y contestale esa pregunta».

Línea de base, en un sidecar recién creado con el motor de la rama antes del cambio: `install claude` con
`CLAUDECODE=1` y sin la variable dio la misma salida, sin ninguna línea sobre la sesión. Las dos líneas de ubicación
decían «los encuentra por nombre una sesión abierta en …», también la de `.claude/agents`.

Contra el caso:

- **Fix 1, la línea de `install` con `CLAUDECODE=1`:** se hizo, con dos diferencias. Sale con `!`, como los demás
  avisos, y no con `→`, porque el `→` es el cierre único de `init` (`wiring.js`). Y nombra a la persona: la lee primero
  el agente que corrió `install` desde su herramienta, y la acción es de la persona. Las dos las pidió la revisión
  independiente.
- **Fix 2, la línea de los workflows deja de decir «una sesión abierta»:** se hizo distinto. Dice «la sesión que se
  abra en …» siempre, y no sólo cuando hay agentes en la misma instalación: es cierto para los dos, y una condición más
  no compraba nada.
- **Fix 3, el README:** se hizo, en «El primer ciclo».
- **Fix 4, prueba con y sin la variable y mutación:** se hizo, en `test/wiring/open-session.test.js`, con más bordes
  que los que pedía el caso (abajo).
- **Tradeoff, los otros runners no están medidos:** se respetó. Sólo el manifiesto de claude declara `startup`, y la
  prueba comprueba que `install gemini` con la variable no da la línea.
- **Tradeoff, `CLAUDECODE` no es una interfaz documentada:** queda así. La prueba fija el nombre, y el README lo dice
  sin depender de la variable.
- **Tradeoff, desde una terminal no cambia nada:** comprobado, con la salida de `init` sin la variable.

Lo que el caso no preveía:

- **El runner cambió de versión entre la medición y el arreglo** (2.1.323 → 2.1.325). La sonda se repitió en 2.1.325
  con Haiku: en una sesión interactiva en tmux, el archivo `.claude/agents/probe-502.md` se creó a las 07:10:48 y el
  turno siguiente siguió dando `Agent type 'probe-502' not found`. `claude -p` en el mismo directorio devolvió
  `PROBE-OK`.
- **La primera versión rompía `init --runner ninguno --install`**: le pedía el manifiesto a `ninguno` y tiraba una
  excepción al final, con la instancia ya creada. Lo encontró la revisión independiente. Arreglarlo arregló también el
  «→ Abrí ninguno acá» que ya salía antes, y ahora sale «Contestá esa pregunta cuando corras el arranque».
- **Un subagente actualizado no dispara la línea.** Que la sesión abierta lo lea con la definición anterior no está
  medido, así que la línea no lo afirma.
- **La mitad del registro se decide por la configuración que había, no por lo anotado.** Con el manifiesto, un
  `settings.json` recreado recibía el hook otra vez sin aviso.
- **La suite heredaba `CLAUDECODE=1`** al correr dentro de Claude Code, y la prueba de `init` de `instance.test.js`
  comparaba el cierre sin sesión. Ahora borra la variable.

### Lista de cierre

1. hecho: la salida de `install claude` con y sin `CLAUDECODE=1` antes del cambio, idénticas y sin la línea; el
   cierre de `init` era «Abrí claude acá» en los dos casos.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: `open-session.test.js` en rojo con `engine/automation/index.js` sin el cambio (`git stash`), y en verde con él.
4. hecho: diez mutaciones, todas en rojo: sacar la condición de sesión, el `status === 'nuevo'`, el filtro por
   carpeta, la condición del hook sobre `current`, volver al `includes` sobre el JSON entero, cada una de las dos
   mitades del texto, el «repetir ahí su pedido», el `own` de `wiring.js` y el «una sesión nueva de». La del filtro
   por carpeta sobrevivió en la primera versión y se le sumó el caso de un workflow repuesto.
5. hecho: la frase «una sesión abierta» de la línea de ubicación tiene su aserción de ausencia, en rojo con la frase
   devuelta. El cierre de `init` sin sesión, lado a lado: antes y después dice «→ Abrí claude acá y contestale esa
   pregunta».
6. hecho: `init --runner claude --install` real, con un npm que enlaza el motor, en un repositorio recién creado,
   desde esta sesión de Claude Code (`CLAUDECODE=1`): la línea `!` y el cierre nuevo. Con `env -u CLAUDECODE`, ninguna
   de las dos. `init --runner ninguno --install`, exit 0.
7. hecho: el mecanismo del runner, medido con la sonda en Claude Code 2.1.325 (arriba). La salida, desde una sesión
   real de Claude Code, y además dentro de una sesión `claude -p` con Haiku que corrió `automation install` sola: la
   línea `!` salió, y el agente le dijo a la persona que abriera una sesión nueva en la ruta que nombraba (cierre del
   503).
8. hecho: corrieron `install` en sidecar y en un repositorio con `ops/` adentro (el de `init`), con la variable y sin
   ella, la primera instalación y las repetidas, y `gemini`. No corrieron Codex ni Antigravity, que no declaran
   `startup`, ni el modo embebido.
9. hecho: dos de cada cosa donde coordina: dos runners (`claude` da la línea y `gemini` no), y dos mitades que se
   prueban por separado.
10. hecho: `install` lo llaman `wiring.js` y `init`; `upgrade` no. Ninguna otra prueba compara «→ claude» ni la frase
    vieja. La de `instance.test.js` heredaba la variable y se corrigió.
11. hecho: tres pasadas independientes. La primera encontró el `ninguno` (impedía entregar) y siete menores, todos
    arreglados. La segunda, una línea de 121 caracteres (impedía entregar) y dos menores, arreglados. La tercera,
    sobre ese arreglo, nada. Queda anotado su borde: un `command` propio con comillas escapadas antes de
    `guard-chat.` corta el match, igual que en `live`. Después de la tercera se recortaron comentarios de las pruebas, y
    una cuarta pasada los revisó todos: el encabezado de `open-session.test.js` decía que el cierre de `init` también
    depende de lo instalado, y no depende. Se corrigió, sin nada que impidiera entregar.
12. hecho: pasada uno por uno. Se recortaron dos comentarios de prueba que repetían la razón del código. El
    tokenizador a 0,22 no da nada propio por encima de 0,25.
13. hecho: `npm run ci` con los archivos nuevos stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con el 503.

**Sin probar:** el modo embebido, Codex, Gemini y Antigravity desde una sesión propia; y si un subagente actualizado se
lee con la definición anterior.
