---
caso: 318
titulo: mktemp resuelve una carpeta donde no se va a escribir
estado: resuelto
resuelto-en: 0.103.6
prioridad: media
version-detectada: 0.103.5
---

# 318 — Dos formas en que el guard juzga una carpeta permitida y la escritura cae en otra

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **media**.

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

## Cierre

**Resuelto en 0.103.6.**

### El recorrido de lo que este caso enumeró

- **Sin `-d`, la variable queda sin resolver — se hizo.**
- **Con `TMPDIR` en el comando, el `mktemp` sin directorio queda sin resolver — se hizo, más angosto.** Cuenta
  una asignación (`TMPDIR=`), no cualquier mención. La primera versión contaba toda mención y frenaba un
  `echo "$TMPDIR"` o un comentario que lo nombrara; lo mostró la revisión.
- **`T=$(mktemp)` para un archivo sigue pasando — se cumplió**: `T=$(mktemp); echo x > $T` pasa antes y después.
- **La copia con `mktemp -d` de siempre se sigue resolviendo — se cumplió**, también con `-p <raíz>`, y con
  `-p` aunque el comando asigne `TMPDIR`.

### Lo que este caso encontró y no preveía

- **Una plantilla sin ruta crea en la carpeta donde se está, no en el temporal.** **Verificado** con GNU
  coreutils 9.4: `mktemp -d mut.XXXX` creó `mut.ICqX` en la carpeta actual. El guard la daba por creada en el
  temporal y dejaba pasar la escritura. Ahora queda sin resolver.
- **Un `mktemp -d` que falla, seguido de `;`, salió como caso 327.** La variable queda vacía y el `cd` va a
  la carpeta personal. Arreglarlo pide distinguir `;` de `&&`, que este guard no hace.
- **`TMPDIR` asignado de una forma que la lectura no reconoce sigue resolviendo mal**: con el nombre partido
  por una comilla, o puesto por un archivo que el comando carga. Es evasión deliberada o no se puede saber
  leyendo el comando; queda dicho y no se persigue.

### Qué se corrió

- **El guard instalado, en un banco**, desde una carpeta fuera de las raíces:

  ```
  T=$(mktemp -p <raíz>); cd $T; echo x > a.js                       pasa -> FRENA
  T=$(mktemp); cd $T; echo x > a.js                                  pasa -> FRENA
  export TMPDIR=<afuera>; T=$(mktemp -d); cd $T; echo x > a.js       pasa -> FRENA
  TMPDIR=<afuera>; T=$(mktemp -d); cd $T; echo x > a.js              pasa -> FRENA
  C=$(mktemp -d mut.XXXX) && cd $C && echo x > a.js                  pasa -> FRENA
  T=$(mktemp); echo x > $T                                           pasa -> pasa
  T=$(mktemp -d) && cd $T && echo x > a.js                           pasa -> pasa
  T=$(mktemp -d -p <raíz>) && cd $T && echo x > a.js                 pasa -> pasa
  export TMPDIR=<afuera>; T=$(mktemp -d -p <raíz>); cd $T; …         pasa -> pasa
  echo "$TMPDIR"; T=$(mktemp -d); cd $T; echo x > a.js               pasa -> pasa
  ```

  Las que frenan dicen «un destino que no se puede resolver».
- **Seis mutaciones en rojo, en una copia**: resolver sin `-d`, ignorar `TMPDIR`, contar sólo el exportado,
  contar también el leído, dejar que `TMPDIR` tape a `-p`, y mandar la plantilla sin ruta al temporal.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real, y `mktemp` de otro sistema que no sea GNU.
