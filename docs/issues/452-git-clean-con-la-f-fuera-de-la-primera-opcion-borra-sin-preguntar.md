---
caso: 452
titulo: destructive deja pasar `git clean -d -f` y `git clean -x -f`, que borran sin preguntar, y frena `git clean -fdn`, que sólo simula, porque su regla mira únicamente la primera opción
estado: resuelto
resuelto-en: 0.116.0
prioridad: alta
version-detectada: 0.115.1
---

# 452 — `git clean` con la `-f` fuera de la primera opción borra sin preguntar

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **alta**: un borrado sin recuperación que el guard
cree estar cuidando.

## Resumen

La regla de `destructive` para `git clean` era `/\bgit\s+clean\s+-[^\s]*f/`: busca la `f` sólo en la primera
opción. Eso falla para los dos lados:

- **Deja pasar lo que borra.** `git clean -d -f` y `git clean -x -f` borran los archivos sin seguimiento y no se
  frenan. La primera opción (`-d`, `-x`) no tiene `f`.
- **Frena lo que no borra.** `git clean -fdn` es una simulación (`-n`) y se frena, porque la `f` va en la primera
  opción. Un agente que mira antes de borrar, que es lo que R23 pide, choca con el guard por hacerlo bien.

## Reproducción

El guard solo, en un repositorio con un archivo sin seguimiento:

```bash
P='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git clean -d -f"},"cwd":"<repo>"}'
echo "$P" | CI=1 OPS_ROOT=<instancia> node <motor>/engine/hooks/run.js destructive; echo "exit $?"
```

## Síntoma

Medido el 2026-10-25 con el motor de 0.115.1 y el de `main` (`7e54a2ec`), con la misma salida en los dos:

```
git clean -d -f → exit 0
git clean -x -f → exit 0
git clean --force → exit 2
git clean -df → exit 2
git clean -fdn → exit 2
git clean -n -fd → exit 0
```

Apareció en una sesión real de Claude Code. Antes de un `git clean -fd`, el agente corrió por su cuenta
`git clean -fdn` para ver qué iba a borrar, y el guard lo frenó. El «dale» de la persona quedó atado a esa
simulación, no al comando del paso.

## Causa raíz

- `engine/hooks/shell.js` (la regla de `git clean` en `rulesOf`): `-[^\s]*f` mira sólo la palabra que sigue a
  `clean`, y no hay nada que lea `-n` ni `--dry-run`.

## Fix propuesto

Que la regla frene si alguna opción del mismo tramo fuerza (`-…f…` o `--force`) y ninguna simula (`-…n…` o
`--dry-run`).

## Cierre

**Resuelto en 0.116.0**, en la rama de los huecos de esa versión.

- **Fix propuesto.** Se hizo así: la regla busca la fuerza en cualquier opción del tramo y no frena si alguna
  simula.
- **La prueba.** `test/hooks/destructive.test.js` frena seis formas que fuerzan, entre ellas `-d -f`, `-x -f` y
  `git -C app clean -d --force`, y deja pasar cinco que simulan, entre ellas `-fdn`, `-n -fd` y `--dry-run`. Antes
  del arreglo dio rojo en `git clean -d -f`. En una copia, dos mutaciones dieron rojo: sin excluir la simulación, y
  con la regla vieja de la primera opción.
- **Prueba real.** Una sesión de `claude -p` en un banco sidecar, con el motor de la rama, corrió un paso que decía
  `git clean -d -f` desde `app`. El guard lo frenó con «'git clean -f' borra archivos sin seguimiento» y
  `suelto.tmp` siguió ahí. Con el motor de 0.115.1, el mismo comando sale con `exit 0`.

**Lo que esta regla todavía no ve**, señalado por la revisión de código del conjunto y dejado así a propósito:

- Un valor de `-e` que empieza con guion (`git clean -fdx -e -node-cache`) se lee como una simulación y pasa.
- Una redirección antes de las opciones (`git clean 2>&1 -f`) corta la lectura del tramo y pasa.

Son formas rebuscadas, que un agente no escribe para limpiar. Leer las opciones con su valor pide un parser de
`git clean`, que es más de lo que este caso arregla.

## Relacionados

- 451: la sesión donde apareció.
- R23: mirar antes de borrar, que es lo que este guard frenaba.
