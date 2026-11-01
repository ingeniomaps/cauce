---
caso: 473
titulo: Lo que la lectura de un commit sigue sin ver, y que pide un parser de shell de verdad
estado: abierto
prioridad: baja
version-detectada: 0.117.2
---

# 473 — Lo que la lectura de un commit sigue sin ver

**🔴 abierto** · detectado en 0.117.2 · prioridad **baja**: son formas que ya pasaban antes de los casos 464, 468 y 469, y hay que escribirlas así. Sube a media si aparece una en los diarios de una corrida real.

## Resumen

Los guards leen un comando con expresiones y un lector de opciones. Qué ejecuta un heredoc, o un alias, no se sabe sin un parser de shell. Cada intento de leer más en esta tanda abrió otra forma de esconder una orden, así que estas formas quedaron como estaban.

## Síntoma

Se le pregunta a `run.js pre-shell` en una rama de trabajo, sin ejecutar nada. Salida real, 2026-10-31, corrida fila por fila: exit 0 con el motor anterior y con éste. 

| Comando | Por qué pasa |
|---|---|
| `git commit -m "$(cat <<EOF` con `$(orden)` en el cuerpo | `commandOf` quita el cuerpo del heredoc antes de leer |
| `git commit -F - <<'EOF'`, y una línea `sh -c '…'` después del cierre | el heredoc se lleva el resto del comando |

Frenan sin ejecutar nada peligroso, a propósito: `git tag -m 'cita un verbo'` después de un commit, igual que solo, y `$(git log --grep='cita un verbo')`.

También pasan: un `-c alias.p='push -f' p` o un `-c core.sshCommand='…' fetch`, que corren algo sin que el comando lo diga.

Frena de más, porque con dudas se juzga la sesión: `(cd F && git commit)` con la sesión en la instancia, igual que antes del 468; `cd F || cd R; git commit`; `pushd F; git commit`; `eval git -C F commit`; y `cd F && git -C "$PWD/a b" add -A`, porque fuera de un commit `$PWD` no se sigue.

## Causa raíz

`commitAsRun` (`engine/hooks/as-run.js`) y `commandOf` (`engine/hooks/input.js`).

## Fix propuesto

Hipótesis: un parser de shell propio, sin dependencias, que entienda heredocs y sustituciones, y que reemplace estas lecturas de una vez. Es un proyecto aparte. Antes de empezarlo se mide cuántas de estas formas aparecen en los `journal.jsonl` de las corridas: si no aparecen, no se hace.

## Tradeoffs

Leer comandos es lo más caro de cambiar en el motor: en el 464 costó ocho revisiones independientes y en el 468 y el 469, diez, varias sobre formas como éstas. El generador y el barrido contra el motor anterior que usó esa tanda no viajan con el repositorio: hay que rehacerlos.

## Contexto de descubrimiento

Las revisiones de los casos 464, 468 y 469.

## Relacionados

Casos 464, 469. El 468 cerró lo que era de repositorio: `engine/hooks/commit-repo.js`.
