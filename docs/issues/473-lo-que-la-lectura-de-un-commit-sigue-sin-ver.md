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

Los guards leen un comando con expresiones y un lector de opciones. Cuál `cd` corrió, o qué ejecuta un heredoc, no se sabe sin un parser de shell. Cada intento de leer más en esta tanda abrió otra forma de esconder una orden, así que estas formas quedaron como estaban.

## Síntoma

Se le pregunta a `run.js pre-shell` en una rama de trabajo, sin ejecutar nada. Salida real, 2026-10-31, corrida fila por fila: exit 0 con el motor anterior y con éste. En la rama viva las que commitean frenan por `live-commit`.

| Comando | Por qué pasa |
|---|---|
| `cd /etc; cd R && git commit -m x` | se lee el primer `cd` |
| `(cd R && git commit -m x)`, con la sesión fuera de `R` | tras un paréntesis no se lee |
| `echo git -C /etc && git commit -m x` | se lee el primer `git -C` del comando, aunque sea de otro |
| `git -C /etc status; git commit -m x` | igual, y el commit corre en la sesión |
| `git commit -m "$(cat <<EOF` con `$(orden)` en el cuerpo | `commandOf` quita el cuerpo del heredoc antes de leer |
| `git commit -F - <<'EOF'`, y una línea `sh -c '…'` después del cierre | el heredoc se lleva el resto del comando |

Frenan sin ejecutar nada peligroso, a propósito: `git tag -m 'cita un verbo'` después de un commit, igual que solo, y `$(git log --grep='cita un verbo')`.

También pasan, y `RUNS_CONFIG` en `git-globals.js` no las distingue: `git -c user.name="Git Bot" commit -m x`, porque el valor nombra `git`; `git -C "$PWD/a b" commit -m x`, porque la variable no se expande; y un `-c alias.p='push -f' p` o un `-c core.sshCommand='…' fetch`, que corren algo sin que el comando lo diga.

## Causa raíz

`gitDirectory` (`engine/hooks/input.js`) y `commitAsRun` (`engine/hooks/as-run.js`).

## Fix propuesto

Hipótesis: un parser de shell propio, sin dependencias, que entienda subshells, heredocs y sustituciones, y que reemplace estas lecturas de una vez. Es un proyecto aparte. Antes de empezarlo se mide cuántas de estas formas aparecen en los `journal.jsonl` de las corridas: si no aparecen, no se hace.

## Tradeoffs

Leer comandos es lo más caro de cambiar en el motor: en el 464 costó ocho revisiones independientes y en el 468 y el 469, diez, varias sobre formas como éstas. El generador y el barrido contra el motor anterior que usó esa tanda no viajan con el repositorio: hay que rehacerlos.

## Contexto de descubrimiento

Las revisiones de los casos 464, 468 y 469.

## Relacionados

Casos 464, 468, 469.
