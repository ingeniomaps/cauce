---
caso: 311
titulo: mktemp con directorio deja el cd sin resolver
estado: resuelto
resuelto-en: 0.103.6
prioridad: baja
version-detectada: 0.103.5
---

# 311 — `C=$(mktemp -d -p <scratchpad>) && cd $C && sed -i …` se frena por «destino que no se puede resolver»

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: el agente lo esquiva en una llamada. Es un freno de más sobre lo que R23 pide: hacer la
mutación en una copia.

## Resumen

El guard de límites resuelve las variables que el propio comando asigna, incluida la de un `mktemp`. Sólo
reconocía el `mktemp` que crea en el temporal del sistema. Con un directorio propio —`-p`, `--tmpdir=` o una
plantilla con ruta— la variable quedaba sin resolver, el `cd` también, y toda escritura relativa que viniera
después se frenaba.

## Reproducción

Corrida real con 0.103.5. El agente de QA armó su copia en el scratchpad de la sesión:

```
W=<ws>; S=<scratchpad de la sesión>
mkdir -p $S && C=$(mktemp -d -p $S mut.XXXX) && cp -r $W/app/src $W/app/test $C/
cd $C && sed -i 's/return a - b/return b - a/' src/resta.js
```

## Síntoma

```
BLOQUEADO: el comando hace `cd` a un destino que no se puede resolver acá, así que no hay contra qué
resolver src/resta.js.
```

## Causa raíz

`engine/hooks/input.js`, `assignedValues`: la expresión que reconoce `mktemp` admite un argumento, y sólo lo
da por conocido si empieza con el temporal del sistema. `-p <dir>` son dos argumentos y no coincidía.

## Fix propuesto

- Resolver el directorio donde `mktemp` crea: el de `-p` o `--tmpdir=`, el de la plantilla, o el temporal.
- Juzgarlo por dónde cae, como cualquier otra ruta: adentro pasa, afuera se frena.

## Tradeoffs

- El nombre que `mktemp` elige no se sabe. Se resuelve a una carpeta inventada dentro de ese directorio, que
  para decidir si cae adentro o afuera de las raíces da lo mismo.
- Dos casos que antes frenaban por no saber ahora frenan por saber: `mktemp -d -p /otro` nombra la ruta.

## Contexto de descubrimiento

Revisando los frenos de las corridas reales del caso 310.

## Relacionados

- 261 — las variables que el comando asigna.
- 298 — el `cd` entre comillas, el mismo freno por otra forma.

## Cierre

**Resuelto en 0.103.6.**

### El recorrido de lo que este caso enumeró

- **Resolver el directorio — se hizo, y más angosto que lo propuesto.** Una lista cerrada: `-d`, `-q`, un
  solo `-p <dir>` o `--tmpdir=<dir>`, y una plantilla. Cualquier otra forma queda sin resolver.
- **Juzgar por dónde cae — se hizo.**
- **Tradeoffs — se pagan los dos.** Un directorio relativo o con una variable que no se conoce sigue sin
  resolver, y frena.

### Lo que este caso encontró y no preveía

**La primera versión abría el guard.** Resolvía el directorio de `-p` sin mirar el resto, y `mktemp` tiene
más de una forma de decir dónde crea: con dos `-p` usa el último, con `-p` pegado al valor no se reconocía y
caía al temporal, una plantilla con `..` se sale del directorio que la precede, y con `-t` manda `TMPDIR`. En
las cinco el guard juzgaba una carpeta permitida mientras se escribía en otra. Lo mostró una revisión
independiente del diff, con los comandos. Es el lado caro de un guard de límites, y ninguna prueba lo veía.

Por eso lo que no está en la lista no se adivina. Resolver mal es peor que no resolver.

### Qué se corrió

- **El guard instalado**, en un banco con el motor de esta rama, con seis comandos:

  ```
  copia bajo el scratchpad de la sesión (el comando real)   exit=0
  copia bajo una raíz, con comillas                         exit=0
  hacia afuera de las raíces                                BLOQUEADO: el comando escribe en <afuera>/mktemp/src/suma.js …
  dos -p, el último afuera                                  BLOQUEADO: … un destino que no se puede resolver acá …
  plantilla con .. que se sale                              BLOQUEADO: … un destino que no se puede resolver acá …
  -p pegado al valor, afuera                                BLOQUEADO: … un destino que no se puede resolver acá …
  ```

  Con 0.103.5 de npm, el primero se bloqueaba.
- **Once mutaciones en rojo, en una copia**: cada regla de la lista cerrada. Una sobrevivió —prohibir
  tuberías y redirecciones dentro del `mktemp`— y se sacó: la lista cerrada ya las deja sin resolver.
- **La puerta entera**, `npm run ci`.
