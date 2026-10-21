---
caso: 418
titulo: en removal.js un cd sin argumento se resolvía contra el directorio de antes, y no contra la carpeta personal
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.112.0
---

# 418 — `cd && rm -rf <x>` se juzgaba en el directorio actual: el `cd` solo deja en la carpeta personal, y el borrado de verdad cae ahí

**🟢 resuelto en 0.112.0** · detectado en 0.112.0, presente desde el caso 337 · prioridad **alta**. Es la regla que protege la carpeta
personal y las raíces de un `rm -r` (R23), mirando el lugar equivocado.

## Resumen

`removedDirectories` (`engine/hooks/removal.js`) sigue el `cd` de un comando tramo a tramo para saber dónde cae un `rm -r`.
Con un `cd` sin argumento le pasaba a `cdTarget` la cadena vacía (`cd[1] || ''`), y `path.resolve(base, '')` es la base:
el borrado se juzgaba en el directorio en que se estaba. `cdTarget` ya contestaba bien —con `undefined` devuelve la carpeta
personal— y `shell-changes.js` le pasaba el argumento tal cual; `removal.js` era el único que no.

## Reproducción

El 2026-10-20, el grupo `pre-shell` como proceso sobre un banco en `/var/tmp`, con una copia del motor sin el arreglo:

```
cd && rm -rf .   → BLOQUEADO: 'rm -r' sobre /var/tmp/w407-bench/repo se lleva el directorio actual (destino resuelto desde …)
```

Frenaba, pero por el directorio actual, que no es el que se borra. Con un nombre en vez de `.`, `cd && rm -rf proyecto` se
juzgaba como `<cwd>/proyecto`; si `~/proyecto` es una raíz declarada, el borrado pasaba sin que nada lo mirara.

## Causa raíz

`engine/hooks/removal.js`, `removedDirectories`: `cdTarget(to, base)` con `to = cd[1] || ''`.

## Fix propuesto

Pasarle a `cdTarget` el argumento tal cual, como `shell-changes.js`.

La aceptación pide la mutación: con la cadena vacía de vuelta, la prueba que corre `cd && rm -rf .` tiene que ver otro
motivo que la carpeta personal y fallar.

## Contexto de descubrimiento

La tercera revisión del conjunto de la tanda 396–417, el 2026-10-20, mirando a quién alcanzaba el cambio de `cdTarget`.

## Relacionados

- 337 — el seguimiento del `cd` en `removal.js`.
- 368 — por qué la carpeta personal se cuida por nombre.
- 405 — el cambio de `cdTarget` cuyo alcance se estaba midiendo.

## Cierre

**Resuelto en 0.112.0.** `removedDirectories` le pasa `cd[1]` a `cdTarget`, que con un `cd` solo devuelve la carpeta
personal; `cdTarget` además ya no necesita que la base se sepa para lo que no depende de ella, así que la guarda de base nula
salió de esa línea.

El enunciado, ítem por ítem:

- **Pasar el argumento tal cual**: hecho.
- **La mutación**: abajo.

**Lo que se corrió para saber que funciona.**

- `test/hooks/command-reading.test.js`, «destructive juzga un rm después de un cd solo en la carpeta personal»: `cd && rm -rf .`
  frena con «se lleva la carpeta personal».
- Mutación en una copia fuera del árbol, con `cdTarget(to, base)` de vuelta: roja («destructive bloqueó, pero por otro
  motivo»).
- El grupo `pre-shell` como proceso, antes y después, sobre un banco en `/var/tmp`: `cd && rm -rf .` pasa de «'rm -r' sobre
  …/repo se lleva el directorio actual» a «'rm -r' sobre $HOME se lleva la carpeta personal». No se corrió con un runner
  real: si el guard fallara, el comando borraría de verdad (R23), y la decisión se ve entera en el proceso.

**Lo que encontró la cuarta revisión, y se arregló acá: un `cd` con una redirección no se leía como `cd`.** El tramo
`cd / 2>/dev/null` no coincidía con la forma de un `cd`, así que la base seguía siendo la de antes y `cd / 2>/dev/null && rm
-rf home` pasaba: se juzgaba `home` en el directorio actual. Pero leerlo como un `cd` y nada más rompía una forma fijada a
propósito: `cd /tmp/build 2>/dev/null; rm -rf <raíz>` tiene que frenar por la raíz, porque quien escribe `2>/dev/null` espera
que el `cd` pueda fallar, y entonces el borrado corre donde se estaba. Ahora un `cd` con una redirección se sigue, y lo que
viene después se juzga **en las dos carpetas**. La lectura que saca las redirecciones antes de leer el `cd` es la que
`shell-changes.js` ya hacía. Pasó a `shell-writes.js` como `REDIRECTIONS`, con el mismo valor, para que `removal.js` no la
copie.

Probado así: `test/hooks/command-reading.test.js` suma `cd / 2>/dev/null && rm -rf home`, que frena con «se lleva la carpeta
personal», y la prueba fijada de `removal-boundary.test.js` sigue frenando `cd /tmp/build 2>/dev/null; rm -rf service` por la
raíz. Mutaciones en rojo: sin sacar las redirecciones («Missing expected exception») y juzgando sólo la carpeta nueva
(«Missing expected exception», en la prueba fijada). Por la misma razón que arriba no se corrió con un runner real.
