---
caso: 456
titulo: Un shell que lee el comando de su entrada —`echo "…" | sh`, un heredoc o un here-string a `bash`— escapa a los guards que leen el comando por tramos, porque el comando que corre llega como dato y no como palabra
estado: abierto
prioridad: baja
version-detectada: 0.116.0
---

# 456 — Un shell que lee el comando de su entrada escapa a los guards que leen tramos

**🔴 abierto** · detectado en 0.116.0 · prioridad **baja**: no es la forma en que un agente suele escribir un comando,
y el arreglo del 455 ya cubre `sh -c`, que es la habitual.

## Resumen

Desde el 455, `steps` (`engine/hooks/shell-changes.js`) vuelve a leer lo que corre adentro de `sh -c`, `eval`,
`env -S`, `su -c` y `flock -c`. El shell que lee el comando de su entrada estándar no lo nombra en ninguna palabra:
en `echo 'rm -rf …' | sh` el comando es un argumento de `echo`, y en un heredoc o un here-string es un cuerpo que
`asRead` saca a propósito, porque en todos los demás casos es dato.

## Reproducción

El guard de límites desde una sesión cualquiera, en una instancia con una raíz declarada, con una ruta fuera de las
raíces, igual que `test/hooks/removal-boundary.test.js`.

## Síntoma

Medido el 2026-10-26 con el motor de `main` (`0f6c5f32`) y con el de la rama del 455; los dos dan lo mismo:

```
frena  rm -rf $HOME/fuera-de-las-raices/sub
pasa   echo 'rm -rf $HOME/fuera-de-las-raices/sub' | sh
pasa   printf 'rm -rf $HOME/fuera-de-las-raices/sub' | bash
pasa   bash <<EOF
       rm -rf $HOME/fuera-de-las-raices/sub
       EOF
pasa   sh <<< 'rm -rf $HOME/fuera-de-las-raices/sub'
```

## Causa raíz

- `engine/hooks/shell-changes.js` (`hidden`): un shell sin `-c` no tiene comando que leer.
- `engine/hooks/shell-changes.js` (`asRead`, `withoutBodies`): el cuerpo de un heredoc se quita antes de leer.

## Fix propuesto

Que el cuerpo de un heredoc o de un here-string dirigido a `sh|bash|zsh|dash|ksh`, y el argumento de un `echo` o un
`printf` cuya salida va por tubería a uno de ellos, se lea con `steps` como el de `sh -c`. Hay que mirar que no cambie
lo que `destructive` frena, que comparte `asRead`.

## Contexto de descubrimiento

El arreglo del 455, el 2026-10-26: buscando qué más afirmaba que un `sh -c` no se ve, apareció `FEEDS_SHELL`
(`engine/hooks/input.js`), que ya reconoce la tubería a un shell para otra pregunta.

## Relacionados

- 455: la misma clase, con el comando en una palabra.
