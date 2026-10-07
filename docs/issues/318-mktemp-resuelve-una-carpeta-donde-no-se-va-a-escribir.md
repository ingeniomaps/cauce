---
caso: 318
titulo: mktemp resuelve una carpeta donde no se va a escribir
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 318 — Dos formas en que el guard juzga una carpeta permitida y la escritura cae en otra

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: las dos dejan pasar una escritura fuera de las raíces. No se vieron en ninguna corrida.

## Resumen

El guard resuelve la variable de un `mktemp` para saber dónde cae un `cd`. En dos formas resuelve mal, y el
error va hacia el lado que deja pasar.

## Reproducción

Con el lector real:

```
T=$(mktemp -p <raíz>); cd $T; echo x > a.js
   el guard juzga <raíz>/mktemp/a.js. Sin `-d`, mktemp crea un archivo: el `cd` falla y, con `;`, la
   escritura cae en la carpeta desde donde se corrió.

export TMPDIR=<afuera>; T=$(mktemp -d); cd $T; echo x > a.js
   el guard juzga <temporal del sistema>/mktemp/a.js, que no frena. mktemp crea en <afuera>.
```

La segunda es anterior al caso 311. La primera existía para el temporal y el 311 la extendió a `-p`.

## Causa raíz

`engine/hooks/input.js`, `mktempParent`: acepta `mktemp` sin `-d`, y supone que sin directorio propio crea en
el temporal del sistema que ve el proceso del guard.

## Fix propuesto

- Sin `-d`, la variable no es una carpeta: queda sin resolver.
- Si el mismo comando asigna o exporta `TMPDIR`, el `mktemp` sin directorio queda sin resolver.

## Por qué hacerlo

Las dos correcciones van hacia el lado que frena, que es el seguro en un guard de límites, y son dos líneas.

## Riesgos y regresiones

- **`T=$(mktemp)` para un archivo temporal** es muy común. Hoy un `> $T` pasa; después, la variable queda sin
  resolver y un destino sin resolver no se juzga. Sigue pasando. Lo que cambia es el `cd $T`, que con un
  archivo no tiene sentido.
- **Regresión**: baja. Hay que comprobar que la copia con `mktemp -d` de siempre siga resolviéndose.

## Qué habría que probar

- Las dos formas: quedan sin resolver y frenan la escritura relativa.
- `T=$(mktemp -d) && cd $T`, `mktemp -d -p <raíz>` y `T=$(mktemp); echo x > $T`: como hoy.

## Recomendación

**Hacerlo**, junto con el 312: es el mismo archivo y la misma revisión.

## Relacionados

- 311 y 261.
