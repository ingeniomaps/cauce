---
caso: 261
titulo: el guard de límites frena el cd a una copia desechable
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 261 — El guard de límites bloquea un comando que hace `cd` a una ruta guardada en una variable, que es como se arma una copia desechable

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no deja pasar nada y el agente se recupera reescribiendo el comando, pero cae justo sobre la práctica que
R23 pide —mutar en una copia y no en el árbol— y cuesta una vuelta cada vez.

## Resumen

Para saber si un comando escribe fuera de las raíces declaradas, el guard resuelve contra qué directorio
corre. Si el comando hace `cd` a una variable —`T=$(mktemp -d) && cd $T`— no puede resolverlo y bloquea.
Esa es la forma natural de correr una mutación o un QA en una copia.

## Reproducción

Corrida real de `autobuild` en un banco sidecar instalado, 2026-10-05. Tres comandos de tres agentes
distintos —Build, QA y el que anota en el INBOX—, los tres con esta forma:

```bash
T=$(mktemp -d) && cp -r $R/app/src $R/app/test $R/app/package.json $T/ && cd $T \
  && sed -i "/email is required/d" src/alta.js && npm test
```

## Síntoma

```
BLOQUEADO: el comando hace `cd` a un destino que no se puede resolver acá, así que no hay contra qué resolver src/alta.js. Escribí la ruta absoluta, o hacé el `cd` en un comando aparte
```

Los tres agentes reescribieron el comando y la corrida terminó. El tercero no iba a una copia: hacía `cd`
a `planning/inbox/propuestas` con la ruta en una variable, que sí está dentro de las raíces.

## Causa raíz

No se abrió el código del guard para este caso; el mensaje sale de la resolución de rutas de los guards de
límites. Lo establecido es la conducta: una variable en el `cd` no se expande, aunque su valor esté
asignado en el mismo comando.

## Fix propuesto

Resolver la variable cuando el propio comando la asigna con un literal o con `mktemp`, y tratar el
resultado de `mktemp` como temporal del sistema. Lo que no se pueda resolver sigue frenando.

## Tradeoffs

- Expandir variables es interpretar shell, y cada forma que se agrega es una forma de equivocarse hacia
  el lado que deja pasar. El alcance tiene que ser angosto: asignación literal en el mismo comando.
- El mensaje ya dice cómo salir, y los tres agentes salieron. El costo de no arreglarlo es una vuelta por
  comando, no una corrida.

## Contexto de descubrimiento

La corrida real que probó los casos 248 a 260.

## Relacionados

- 259 — un guard lee como comando el texto que va dentro de otro comando.
- 258 — verify opina sobre un repositorio que no es el de la sesión.

## Cierre

**Resuelto en 0.101.0.** Los guards expanden, donde un `cd` o un `git -C` la usa, la variable que el
propio comando asigna. Sólo eso: una asignación que ocupa su tramo entero, con un literal, con otra
variable ya resuelta o con `mktemp` sin directorio propio, y una sola vez por nombre.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, con el alcance angosto que el tradeoff pedía.
- **«No se abrió el código del guard» — se abrió**: `cdTarget` (`engine/hooks/shell.js`) devuelve «no se
  sabe» ante cualquier `$`. Eso no cambió; lo que cambió es que la variable llega ya expandida.
- **Tradeoff «cada forma que se agrega es una forma de equivocarse hacia el lado que deja pasar» — acotado
  con pruebas de lo que sigue sin resolverse**: una variable sin asignar, una reasignada, una que sale de
  otro comando, un `mktemp` con directorio propio o fuera del temporal, y una entre comillas simples.
- **El tercer comando del Síntoma**, el `cd` a una carpeta dentro de las raíces — pasa también.

### Lo que el caso no preveía

- **El mismo arreglo alcanza al repositorio de un commit.** Con la ruta en una variable, `git -C $W/app`
  colgaba de la carpeta de la sesión y se frenaba como «no se pudo leer el índice»; ahora apunta a donde
  la variable dice, y si es un repositorio ajeno, pasa (caso 258).
- **`gitDirectory` no veía un `cd` después de un salto de línea**, que es como se escriben dos pasos en un
  solo comando. Se agregó el salto a sus separadores.

### Qué se corrió

- **Las formas de la corrida real, en pruebas**: `T=$(mktemp -d) && cp … && cd $T && sed -i …` pasa, y una
  variable que resuelve fuera de las raíces frena con «fuera de las raíces», no con «sin resolver».
- **Cinco mutaciones en rojo**, en una copia: sin expandir nada, expandiendo una reasignada, tomando
  cualquier `mktemp` por temporal, expandiendo dentro de comillas simples, y el repositorio sin usar la
  expansión.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió todavía**: el guard de límites instalado, en una sesión real. Este repositorio no
  lo tiene activo; se prueba en el banco.
