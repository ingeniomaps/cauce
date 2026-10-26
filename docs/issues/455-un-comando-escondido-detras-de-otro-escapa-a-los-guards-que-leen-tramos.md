---
caso: 455
titulo: Un comando que corre escondido detrás de otro —`sh -c "…"`, `eval`, `env -S`, o un envoltorio que no está en la lista de prefijos como `stdbuf` o `sudo -T`— escapa a los guards que leen el comando por tramos (line-scope, los límites de escritura y borrado), porque `steps` sólo ve el verbo de afuera
estado: abierto
prioridad: media
version-detectada: 0.116.0
---

# 455 — Un comando escondido detrás de otro escapa a los guards que leen tramos

**🔴 abierto** · detectado en 0.116.0 · prioridad **media**: cualquier agente que envuelve el comando —a propósito o
porque así lo escribe— en una cáscara, un `eval` o un envoltorio que el lector no conoce.

## Resumen

Los guards que juzgan dónde escribe, borra o qué checkout cambia un comando lo leen con `steps`
(`engine/hooks/shell-changes.js`): parten el comando en tramos, sacan los prefijos conocidos (`LEADING` y, desde el 454,
`VALUED`) y se quedan con el verbo y sus palabras. Lo que corre adentro de un string —`sh -c "…"`, `bash -lc '…'`,
`eval "…"`, `env -S "…"`— no se lee, y un envoltorio que no está en la lista (`stdbuf`, `ionice`, `taskset`, `flock`,
`setsid`, `doas`, o una bandera con valor que falta, como `sudo -T`) pasa a ser el verbo. En los dos casos el comando de
verdad no se juzga.

## Reproducción

Banco sidecar (`node engine/cli/ops.js bench sidecar --force`), con la línea `piloto` sobre `app`. Una sesión que dijo
`/autobuild piloto` y después «implementá la tarea», desde el árbol de la línea, en `bypassPermissions`. Y el guard de
límites desde la sesión principal, con una ruta fuera de las raíces.

## Síntoma

Medido el 2026-10-26, con el motor de `main` (`17a29fce`) y con el de la rama del 454; los dos dan lo mismo:

```
exit 2  git -C <banco>/app stash
exit 0  sh -c "git -C <banco>/app stash"
exit 0  bash -lc 'git -C <banco>/app stash'
exit 0  eval "git -C <banco>/app stash"
exit 0  env -S "git -C <banco>/app stash"
exit 0  stdbuf -oL git -C <banco>/app stash
exit 0  sudo -T 10 git -C <banco>/app stash
```

`shell-boundary`, desde la sesión principal:

```
exit 2  rm -rf $HOME/fuera-de-las-raices/sub
exit 0  sh -c 'rm -rf $HOME/fuera-de-las-raices/sub'
exit 0  stdbuf -oL rm -rf $HOME/fuera-de-las-raices/sub
```

## Causa raíz

- `engine/hooks/shell-changes.js` (`steps`): el verbo es la primera palabra que no es un prefijo de `LEADING` ni de
  `VALUED`, y el string de `-c`, `eval` o `env -S` es una palabra más.
- La lista de prefijos es abierta: lo que no está nace afuera, que es la forma que R27 describe.

## Fix propuesto

Dos partes, y la segunda pide una decisión:

1. Leer adentro: el string de `sh|bash|zsh|dash -c`, de `eval` y de `env -S` se vuelve a partir con `steps`, desde la
   misma carpeta y con el mismo entorno.
2. Para el envoltorio desconocido no hay lista que alcance. Las opciones: un comparador que recorra los envoltorios
   habituales y falle hasta clasificarlos (R27), o tratar como desconocido el verbo que no es un comando de la lista de
   los que se juzgan y lleva otro conocido entre sus palabras (`stdbuf -oL git …`).

## Contexto de descubrimiento

Las revisiones de código del arreglo del 454, el 2026-10-26. Cada pasada encontraba otro envoltorio; la clase es de
`steps`, no de `--git-dir`, y ya está en `main`.

## Relacionados

- 454: donde apareció; sumó `VALUED` para `sudo -u`, `env -u`, `nice -n`, `timeout`, `xargs`, `exec -a` y `time -f`.
- 423 y 365: los guards que esto rodea.
