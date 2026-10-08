---
caso: 313
titulo: un contenedor con tope de recursos no cuenta como acotado
estado: resuelto
resuelto-en: 0.103.6
prioridad: baja
version-detectada: 0.103.5
---

# 313 — `docker run --memory 4g --cpus 4 … jest` se frena por «jest sin cota de workers»

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: el agente lo esquiva, pero para esquivarlo tiene que dejar de correr el e2e como lo corre el CI.

## Resumen

El guard de workers frena un runner de pruebas sin tope de procesos. Deja pasar el que corre dentro de un
comando que el proyecto declaró en `boundedCommands`. Un contenedor lanzado a mano con su propio tope de
memoria y de CPU está igual de acotado, y no se reconoce.

## Reproducción

Con el guard real y `boundedCommands: ["scripts/run.sh"]`:

```
docker run --rm --memory 4g --cpus 4 node:24 sh -c 'pnpm exec jest --config e2e.json'   → FRENA
scripts/run.sh sh -c 'pnpm exec jest'                                                    → PASA
docker run --rm node:24 sh -c 'pnpm exec jest'                                           → FRENA
```

En la instancia real el agente usó `docker run` porque su runner declarado no monta el socket que el e2e
necesita, y lo lanzó con `--memory 4g --memory-swap 4g --cpus 4 --pids-limit 4096`.

## Causa raíz

`engine/hooks/workers.js`: lo acotado es lo que empieza con un comando de `boundedCommands`. No hay otra forma
de declarar una cota.

## Fix propuesto

- Reconocer como acotado un `docker run` o `podman run` que traiga **las dos** banderas: memoria (`--memory`
  o `-m`) y CPU (`--cpus`).
- Sin las dos, sigue frenando.

## Por qué hacerlo

Lo que el guard cuida es la máquina: que una suite no la tire. Un contenedor con tope de memoria y de CPU no
puede. Frenarlo empuja al agente a correr la prueba de otra forma que la del CI, que es peor.

## Riesgos y regresiones

- **Un tope que no acota**: `--memory 64g` en una máquina de 32 pasa. No se puede juzgar el número sin saber
  la máquina; quien lo escribe ya decidió cuánto. Es el mismo criterio que `boundedCommands`.
- **Dos contenedores a la vez** suman. El guard tampoco lo ve hoy con el runner declarado.
- **Regresión**: baja. Es una forma más que pasa, en una lista cerrada. Lo que hoy frena sin las dos banderas
  sigue frenando.

## Qué habría que probar

- El comando real de la instancia con el guard instalado, y las variantes con una sola bandera.
- Que el script declarado siga pasando y un `docker run` sin tope siga frenando.

## Recomendación

**Hacerlo.** Es chico, angosto y va en la dirección que el guard dice cuidar.

## Relacionados

- 291 — `boundedCommands`.
- R26 — una puerta acota su propio costo.

## Cierre

**Resuelto en 0.103.6**, más angosto que lo propuesto.

### El recorrido de lo que este caso enumeró

- **Reconocer `docker run` y `podman run` con los dos topes — se hizo, con tres condiciones que el caso no
  traía.** Los topes tienen que estar entre las opciones anteriores a la imagen; cada vez que aparezcan, con un
  número mayor que cero; y con `--memory`/`-m` y `--cpus` escritos así, no otra bandera que empiece igual.
  También pasa con `sudo` delante y partido en varios renglones con `\`.
- **Sin las dos, sigue frenando — se cumplió.**
- **«Un tope que no acota» — se dejó como el caso decía**: el número no se juzga.
- **«Dos contenedores a la vez suman» — se dejó**: tampoco se ve con el runner declarado.
- **El comando real con el guard instalado y las variantes con una sola bandera — se hizo**, abajo.
- **El script declarado sigue pasando y un `docker run` sin tope sigue frenando — se cumplió.**

### Lo que este caso encontró y no preveía

**El riesgo no era «bajo».** Dos revisiones independientes encontraron ocho formas en que la versión de
turno dejaba pasar un runner sin tope en la máquina. Ninguna estaba en la lista de riesgos:

- **El runner dentro de una sustitución.** En `docker run <topes> img true $(npx jest)` el `jest` lo ejecuta
  la máquina antes de lanzar el contenedor, y heredaba su cota. Lo mismo con `<(…)`, con backticks y con una
  sustitución entre comillas dobles que trae sus propios separadores.
- **Una comilla que el shell no abre.** Un `\'`, o un comentario con apóstrofo, escondía el separador
  siguiente y el runner de después heredaba la cota.
- **Banderas después de la imagen**, que son del programa de adentro.
- **El valor de otra opción con forma de tope**, y **el tope repetido con un cero**.
- **Una opción sin valor que faltaba en la lista** se llevaba la imagen, y lo que seguía se leía como opciones.

**El mismo defecto ya estaba en `boundedCommands`.** `scripts/run.sh true $(npx jest)` pasaba con el script
declarado desde el caso 291. Quedó arreglado con la misma lectura.

**De paso dejan de frenar**, con un comando declarado: el que va partido en renglones con `\`, el que va
detrás de un comentario con apóstrofo, y el que se lanza dentro de `$(…)` o `<(…)`.

**Lo que esta lectura no ve salió como caso 329**: el runner pasado al contenedor sin `sh -c`, que hoy pasa
sin ningún tope, y las formas que siguen frenando de más.

**Y una más, que encontró la revisión del conjunto antes de publicar.** Para saltear las variables de
adelante (`DOCKER_HOST=x docker run …`) se sacaba toda palabra con forma `NOMBRE=valor`, también el valor de
un `-e NODE_ENV=test`. La opción quedaba sin valor y se llevaba la palabra siguiente: con `-e` antes de los
topes seguía frenando, que es la forma corriente, y con los topes después de la imagen dejaba pasar. Ahora se
saltean sólo las de adelante. Las pruebas traían el `-e` siempre después de los topes.

### Lo que queda como está, y dicho

- **`podman` sin el controlador de CPU delegado.** Que un podman sin privilegios aplique `--cpus` en toda
  máquina es **hipótesis**: no se ejecutó. La sintaxis es la misma en las dos ayudas.
- **`--memory-swap -1` pasa**, con el swap sin tope, y **montar el socket de docker pasa**: los contenedores
  hermanos que lance no heredan el tope. Son decisiones de quien escribe el comando, igual que el número.
- **La lista de opciones sin valor es la de docker 27.2.1 y podman 4.9.3.** Una versión que agregue otra
  pide agregarla; una prueba recorre la lista entera, pero no puede leer la ayuda de una versión que no está.
- **El `)` de un `case` dentro de una sustitución** la cierra antes de tiempo.

### Qué se corrió

- **El guard instalado, en un banco con `boundedCommands` declarado: 45 comandos.** De los 26 de la línea de
  base cambian nueve, los que traen los dos topes:

  ```
  docker run --rm --memory 4g --memory-swap 4g --cpus 4 --pids-limit 4096 -v <socket> node:24 sh -c '…jest…'   FRENA -> pasa
  docker run --rm --memory=4g --cpus=2.5 node:24 sh -c 'npx jest'                                              FRENA -> pasa
  docker run -m 4g --cpus 2 node:24 sh -c 'npx vitest run'                                                     FRENA -> pasa
  podman run --rm --memory 2g --cpus 2 node:24 sh -c 'npx jest'                                                FRENA -> pasa
  ```

  Siguen frenando: sin tope, con uno solo, con `--memory-swap` o `--cpu-shares` en su lugar, con cero, sin
  valor, con las banderas dentro del script, `docker exec`, `docker compose run` y otro programa. De los 19
  agregados por las revisiones, cinco pasan —varios renglones con `sudo`, `cd api && … -v "$(pwd)":/app`,
  `podman run --replace --rmi`, la sustitución dentro del script entre comillas simples, y el comando
  declarado dentro de `$(…)`— y catorce frenan, que son las formas de arriba.
- **Las pruebas nuevas en rojo sin el cambio**, y **49 mutaciones en rojo, en una copia**: 28 sobre los topes
  y las opciones, 21 sobre la lectura del comando de afuera. Seis sobrevivieron en algún momento y cada una
  tiene ahora su aserción; una condición resultó inobservable y se sacó. Una mutación dejó la prueba en un
  bucle sin fin: se contó como roja y el corredor tiene tope de tiempo.
- **Dos revisiones independientes del diff.** La segunda corrió además 200.000 comandos armados al azar
  contra la lectura nueva: ninguna excepción, 0,4 ms el más lento.
- **La ayuda de las dos herramientas**: `-m, --memory … Memory limit` y `--cpus … Number of CPUs` en docker
  27.2.1 y en podman 4.9.3, que agrega «The default is 0.000 which means no limit».
- **La puerta entera**, `npm run ci`, con cobertura de ramas del guard en 100.
- **Lo que no se corrió**: ningún contenedor, y una instancia real.
