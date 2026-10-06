---
caso: 286
titulo: el guard de workers toma jest dentro de un grep por una ejecución
estado: resuelto
resuelto-en: 0.103.1
prioridad: media
version-detectada: 0.103.0
---

# 286 — `grep -n 'jest' package.json` dispara el guard de workers como si corriera jest sin cota

**🟢 resuelto en 0.103.1** · detectado en 0.103.0 · prioridad **media**.

**Prioridad media**: no rompe nada, pero desde que el modo `auto` volvió al diálogo (0.103.0) cada falso
positivo detiene un recorrido hasta que una persona lo aprueba. Sube a alta mientras el 285 siga abierto.

## Resumen

El guard de workers frena un `jest` o `vitest` sin `--maxWorkers`. Reconoce al runner «en posición de
comando», y cuenta como tal lo que viene después de una comilla. Un `grep` cuyo patrón es `'jest'`, o que
lleva un patrón entre comillas seguido de `jest.config.*`, cae ahí. No corre ningún runner.

## Reproducción

Sobre 0.103.0, pasándole al hook la llamada tal como la manda Claude Code. Los dos comandos son los que
corrió el recorrido `wf_5ffcbcab-35a` en esa instancia, recortados a la parte que dispara:

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","permission_mode":"auto","prompt_id":"x",
  "tool_input":{"command":"grep -n '"'"'jest'"'"' -A25 package.json"},"cwd":"/tmp"}' \
  | automatization/hooks/guard-shell.sh

echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","permission_mode":"auto","prompt_id":"x",
  "tool_input":{"command":"grep -rn -E '"'"'swc'"'"' jest.config.* package.json"},"cwd":"/tmp"}' \
  | automatization/hooks/guard-shell.sh
```

Los comandos completos se corrieron así, contra el guard instalado; los recortados de arriba **no se
corrieron** por separado.

## Síntoma

Con los dos comandos completos, el hook sale con 0 y pide el diálogo:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask",
 "permissionDecisionReason":"'jest' sin cota de workers lanza tantos procesos como núcleos, y dos a la vez
 tiran la máquina. Agregale --maxWorkers=2 (o --runInBand). […]"}}
```

En la corrida real, esas dos llamadas esperaron 590 y 1446 segundos a que una persona las aprobara.

## Causa raíz

`engine/hooks/workers.js`, 0.103.0:

```js
const AT = String.raw`(?:^|[;&|(\n'"])\s*(?:\w+=\S*\s+)*`
const RUNNER = new RegExp(AT + LAUNCHER + String.raw`(?:\S*\/)?(jest|vitest)\b(${SAME})`, 'g')
```

La comilla está en `AT` a propósito —el comentario lo dice: «lo que va entre comillas no se vacía, porque
`bash -c "npx jest"` sí lo corre»—, y el mismo comentario afirma que «`jest` dentro de un `grep` […] no es
correrlo». Las dos cosas no se cumplen a la vez:

- `'jest'` — la comilla de apertura deja a `jest` en posición de comando.
- `'swc' jest.config.*` — la comilla de **cierre** de `'swc'`, más un espacio, hace lo mismo con lo que
  sigue; `\b` corta en el punto de `jest.config`.

El caso 259 (0.101.0) hizo que los guards de shell dejaran de tomar por comando el texto que `sed`, `grep`,
`rg`, `echo`, `printf` o `jq` sólo leen. Este guard tiene su propio lector y no lo recibió.

## Fix propuesto

- Usar acá la misma lectura del 259: los argumentos de un programa que sólo lee texto no son comandos.
- Y dejar de contar la comilla de cierre como posición de comando: sólo abre comando la comilla que sigue a
  un `-c` de un shell (`bash -c "…"`, `sh -c '…'`), que es el caso que el comentario quería cubrir.
- Aparte, y es el 285: aunque el `jest` fuera real, esta regla es corregible —su mensaje ya dice el
  arreglo— y no debería preguntarle a nadie.

## Tradeoffs

- Restringir la comilla al `-c` de un shell deja pasar formas raras de lanzar un runner entre comillas
  (`xargs -I{} sh -c`, un `eval`). El guard ya declara que sólo ve la llamada directa.

## Contexto de descubrimiento

Una instancia sidecar, 0.103.0, primera corrida de `autobuild` con esa versión. Los agentes de Ready y de Verify
leían `package.json` para entender la configuración de pruebas del servicio, que es exactamente lo que un
agente hace antes de tocar un script de pruebas: no es un borde.

En esa instancia el guard además es redundante: un `jest` en el host ya lo frena un guard del proyecto, y dentro
del contenedor corre con tope de memoria y de CPU.

## Relacionados

- **285** — qué hace un guard al frenar. Este falso positivo es el que mostró el costo del diálogo.
- **259** — el texto que un programa sólo lee no es un comando. Mismo defecto, en el lector general.
- **232** — el origen del guard de workers.

## Cierre

**Resuelto en 0.103.1.**

### El recorrido de lo que este caso enumeró

- **Usar la lectura del 259 — se hizo.**
- **Dejar de contar la comilla de cierre, y abrir comando sólo detrás del `-c` de un shell — se hizo.**
- **Que la regla sea corregible y no le pregunte a nadie — se hizo**, en el 285.
- **«Los recortados no se corrieron por separado» — se corrieron**, antes y después.
- **Tradeoff — se paga.**

### Qué se corrió

- **La reproducción, antes y después**, contra el guard: `grep -n 'jest' -A25 package.json` y `grep -rn -E
  'swc' jest.config.* package.json` salían con 2 y ahora con 0. Los controles no cambiaron: `npx jest` y
  `bash -c 'npx jest'` siguen saliendo con 2, y `npx jest --maxWorkers=2` con 0.
- **Tres mutaciones en rojo**, en una copia: la comilla abriendo comando otra vez, sin el `-c` de un shell, y
  sin la lectura común. Esta última sobrevivió la primera vez —el otro cambio alcanzaba para los casos
  escritos— hasta agregar un patrón con un separador adentro: `grep -n 'lint; npx jest' Makefile`.
- **La puerta entera**, `npm run ci`.
