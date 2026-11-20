---
caso: 525
titulo: una redirección en el push se lee como otra rama, y la orden del chat no alcanza
estado: abierto
prioridad: alta
version-detectada: 0.123.0
---

# 525 — una redirección en el push se lee como otra rama, y la orden del chat no alcanza

**🔴 abierto** · detectado en 0.123.0 · prioridad **alta**: no deja pasar nada indebido, pero en una sesión real la orden
de push por chat casi nunca funciona. Los agentes agregan `2>&1` al push, y con eso la orden de la persona no alcanza y el
bloqueo ofrece pegar una línea que no tiene sentido (`push origin 2> @ …`).

## Resumen

El guard de push saca los destinos del comando sin quitar las redirecciones. En `git push origin feat/x 2>&1`, el `&`
corta el tramo y lo que queda, `origin feat/x 2>`, se lee como el remoto y dos ramas: `feat/x` y `2>`. La orden «subí
feat/x a origin» autoriza `push origin feat/x` y no `push origin 2>`, así que el push frena. Pasa con cualquier
redirección: `2>&1`, `> log`, `2>/dev/null`.

## Reproducción

Desde la raíz de Cauce, por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), sobre un banco propio
con `runner.allowPush: false`, una sesión por mensaje (script en la sesión que lo midió, `real-525.sh`):

```bash
# para cada comando: el mensaje «subí feat/x a origin» y después el PreToolUse con el comando
git push origin feat/x
git push origin feat/x 2>&1
git push -u origin feat/x 2>&1; echo "exit=$?"
git push origin feat/x > /tmp/x.log
git push origin feat/x 2>/dev/null
```

## Síntoma

Igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
pasa   «subí feat/x a origin» → git push origin feat/x
frena  «subí feat/x a origin» → git push origin feat/x 2>&1
frena  «subí feat/x a origin» → git push -u origin feat/x 2>&1; echo "exit=$?"
frena  «subí feat/x a origin» → git push origin feat/x > /tmp/x.log
frena  «subí feat/x a origin» → git push origin feat/x 2>/dev/null
```

En una sesión real de Claude Code 2.1.329 (2026-11-20, banco instalado), con el mensaje «mandá feat/x a origin», el
agente corrió `git -C <banco> push -u origin feat/x 2>&1; echo "exit=$?"; …`, el guard lo frenó, y el agente le pidió a la
persona que pegara en `.ops-approval` la línea `push origin 2> @ <banco>`. Con «subí main a origin» y `main` habilitada
en `pushToLiveBranches`, lo mismo: el agente dijo que la línea que ofrecía el bloqueo «tiene una ruta mal formada».

## Causa raíz

`engine/hooks/push.js:32`, `PUSH = /\bgit\s+push\b([^;&|\n]*)/g`, corta el tramo en el primer `&`, `;`, `|` o salto, y
`destinationsOf` (`push.js:73`) lee lo que queda como remoto y refspecs. En `… feat/x 2>&1` el tramo es `origin feat/x 2>`, y
`2>` sale como una rama más: `destinationsOf` toma como posicional toda palabra que no empieza con `-`
(`push.js:78`), y ninguno de los dos quita una redirección.

## Fix propuesto

Que `destinationsOf` descarte las redirecciones (`N>`, `N>&M`, `>`, `>>`, `<` y su destino) antes de leer remoto y
ramas, y que la línea que ofrece el bloqueo no pueda traer una. Prueba: «subí feat/x a origin» pasa
`git push origin feat/x 2>&1` y `git push origin feat/x > log`; roja hoy.

## Tradeoffs

- Una redirección al final no cambia qué se publica, así que quitarla del ítem no abre nada. Una redirección que el
  shell expande (`> $X`) tampoco cambia el destino del push.
- Hay que mirar si la misma lectura sirve a otros guards que leen el push (la rama viva, el rastro de `trail`).

## Contexto de descubrimiento

Prueba real de la tanda 519-524, 2026-11-20: la primera tanda de sesiones dejó al agente armar su propio push, y lo hizo
con `2>&1`. El arnés de las pruebas nunca agrega redirecciones, por eso no lo había visto.

## Relacionados

- **103** — la orden de push por chat.
- **522** — la orden de push sin verbo, que esta lectura deja sin efecto en sesiones reales.
