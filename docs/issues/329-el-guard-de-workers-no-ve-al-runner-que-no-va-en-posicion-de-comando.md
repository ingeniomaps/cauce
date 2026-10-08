---
caso: 329
titulo: el guard de workers no ve al runner que no va en posición de comando
estado: resuelto
resuelto-en: 0.104.0
prioridad: media
version-detectada: 0.103.5
---

# 329 — `docker run node:24 npx jest` pasa sin ningún tope, y `sh -c 'npx jest'` con los mismos argumentos frena

**🟢 resuelto en 0.104.0** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: el guard frena la forma con `sh -c` y deja pasar la directa, así que la exigencia se
esquiva sin querer, con sólo escribir el comando más corto.

## Resumen

El guard de workers reconoce un runner de pruebas cuando está en posición de comando: al principio, después
de un separador, o detrás del `-c` de un shell. Un runner que otro programa recibe como argumento no lo ve.

## Reproducción

Las mostraron las revisiones del caso 313, con el guard real y sin nada declarado. Pasan todas:

```
docker run --rm node:24 npx jest                         el contenedor no tiene ningún tope
docker run --entrypoint sh node:24 -c 'npx vitest run'
echo `npx jest`                                           la máquina lo ejecuta
cat <<EOF ⏎ $(sh -c 'npx jest') ⏎ EOF                    el cuerpo de un heredoc no se lee
case $x in a) npx jest;; esac
f() { npx jest; }
```

Y hacia el otro lado, formas con el comando declarado o con los dos topes que frenan sin necesidad:

```
sudo scripts/run.sh sh -c 'npx jest'        time scripts/run.sh …        ( scripts/run.sh … )
docker run -m4g --cpus 4 …                   docker run --memory "4g" --cpus "4" …
docker --context ci run --memory 4g --cpus 4 …
```

## Causa raíz

`engine/hooks/workers.js`: `AT` abre posición de comando en `^`, `;`, `&`, `|`, `(`, salto de línea y la
comilla de un `sh -c`. Lo demás no es posición de comando, se ejecute o no.

## Fix propuesto

Hay que decidir primero qué se quiere, porque los dos caminos cambian el producto:

- **Ver al runner como argumento de un lanzador conocido** (`docker run`, `podman run`, `env`, `time`,
  `sudo`, `xargs`): frena formas que hoy pasan, y cada lanzador que falte sigue pasando.
- **O dejarlo dicho**: el guard cuida la llamada directa, y lo demás lo sostiene la regla.

Lo que frena de más es aparte y más barato: aceptar `sudo` y `time` delante del comando declarado, y el
valor de un tope pegado o entrecomillado.

## Por qué hacerlo

Un freno que se esquiva escribiendo menos no cuida lo que dice cuidar, y además enseña la forma que lo
esquiva.

## Riesgos y regresiones

- **El primer camino frena comandos que hoy corren**, en toda instancia que lance pruebas dentro de un
  contenedor sin `sh -c`. Hay que contar cuántas lo hacen antes de elegirlo.
- **Cada forma nueva de leer un comando es una forma de errar**: el 313 necesitó dos revisiones para una
  sola.

## Qué habría que probar

- Las seis formas de arriba con el guard instalado, antes y después.
- Que nada de lo que el 313 dejó pasando cambie.

## Recomendación

**Decidir antes de hacer.** Propongo el segundo camino más el arreglo barato de lo que frena de más, salvo
que una instancia real muestre la forma directa tirando una máquina.

## Relacionados

- 313, 291, 286 y 232.

## Cierre

**Resuelto en 0.104.0**, por el primer camino y no por el que este caso recomendaba. Lo decidió el dueño el
2026-10-07: el 313 había dejado una inconsistencia —con `sh -c` se pedían los dos topes y sin `sh -c`
nada—, y eso enseña a esquivar el freno escribiendo menos.

### El recorrido de lo que este caso enumeró

Las seis formas de la reproducción:

- **`docker run --rm node:24 npx jest` — se hizo.** El runner que un contenedor recibe como su comando se
  juzga igual que el que va detrás de `sh -c`: pasa con la cota de la herramienta, con los dos topes antes de
  la imagen o con el comando declarado. Vale con `npx`, `bunx`, `yarn` y `pnpm [exec]`, con `podman`, en
  varios renglones, con sustituciones en las opciones y dentro de un subshell o de `$(…)`.
- **`--entrypoint sh node:24 -c 'npx vitest run'` — a medias.** El programa de `--entrypoint` se toma por el
  comando del contenedor, así que `--entrypoint jest img` frena. Con `sh` de entrypoint y el runner en una
  cadena sigue pasando: esa cadena no se lee.
- **Backticks, el cuerpo de un heredoc, `case` y una función — no se hicieron.** No son un contenedor, y cada
  una pide leer una forma más del shell, que es lo que el caso 328 descartó.

Los frenos de más:

- **`sudo` y `time` delante del comando declarado — se hizo**, y también `timeout <plazo>`. Una entrada
  declarada con su envoltorio (`sudo acme-run.sh`) sigue valiendo como se escribió.
- **`( scripts/run.sh … )` — no se hizo**: sigue frenando.
- **`-m4g`, `--memory "4g"`, `docker --context ci run` — no se hicieron**, y ahora alcanzan también a la forma
  directa: un contenedor acotado escrito así frena.

Y lo que pedía antes de elegir este camino:

- **«Contar cuántas instancias lanzan pruebas sin `sh -c`» — se hizo, sobre lo que hay.** En los transcriptos
  reales de otros proyectos de esta máquina, la forma directa aparece más que la de `sh -c`: 32 veces contra
  9, en nueve formas distintas. Pasadas por el guard nuevo, **las nueve pasan**: ya traen los dos topes del
  contenedor o `--maxWorkers`. O sea que la forma se usa, y en lo observado nadie queda frenado por este cambio.
  Es una máquina y pocos proyectos: no dice nada de otras instancias.

### Lo que este caso encontró y no preveía

- **`time npx jest` y `timeout 300 npx jest` pasaban.** El runner detrás de un envoltorio no estaba en
  posición de comando. Ahora frenan.
- **La primera versión reventaba el guard.** Cuando algo tenía forma de `docker run` y no lo era —`docker
  run>log`, `docker run-tests`, uno citado entre comillas en un comentario—, salía con un error interno. Lo
  encontró la revisión.
- **Y rompía a quien había declarado `sudo acme-run.sh`**: sacaba el `sudo` del comando y no de la declaración.

### Lo que queda como está, y dicho

- **`docker compose run … npx jest` y `docker exec … npx jest` siguen pasando sin tope.** La revisión
  opina que la primera es tan común como `docker run` a mano. El freno todavía se esquiva por ahí.
- **El runner lanzado por otro programa dentro del contenedor no se ve**: `node node_modules/jest/bin/jest.js`
  y `sh node_modules/.bin/jest`, que aparecen en esos mismos transcriptos, siempre con los dos topes.
- **Entre comillas el contenedor no se ve**: `bash -c "docker run img npx jest"` y `out="$(docker run …)"`.
- **`timeout` con opciones** (`timeout -k 5 10 npx jest`), `env`, `nohup`, `nice` y `sudo -E` no se
  desenvuelven.
- **Lo que corta un comando antes de su cota frena de más**: `npx jest &> log --runInBand`. Es anterior y
  vale igual sin contenedor.
- **El mensaje del freno** dice ahora que en un contenedor alcanza con `--memory` y `--cpus` antes de la
  imagen.

### Qué se corrió

- **El guard instalado, 40 comandos, con 0.103.6 de npm y con esta rama.** Cambian 18:

  ```
  docker run --rm node:24 npx jest                                       pasa  -> FRENA
  docker run --rm -u $(id -u) -v $(pwd):/app -w /app node:24 npx jest    pasa  -> FRENA
  (docker run --rm node:24 npx jest)                                     pasa  -> FRENA
  docker run --rm --memory 4g node:24 npx jest                           pasa  -> FRENA
  time npx jest          timeout 300 npx jest                            pasa  -> FRENA
  sudo scripts/run.sh sh -c 'npx jest'                                   FRENA -> pasa
  timeout 600 scripts/run.sh sh -c 'npx jest'                            FRENA -> pasa
  ```

  Siguen pasando: con los dos topes, con `--maxWorkers`, `--version`, `docker run img npm test`, una imagen
  llamada `jest`, `echo jest` dentro del contenedor, `--entrypoint which img jest`, `docker run-tests` y
  `docker compose run`. Ninguno sale con un código que no sea 0 o 2.
- **41 mutaciones en rojo, en una copia.**
- **Dos revisiones independientes.** La segunda pasó 24.905 variantes generadas por las dos versiones: 2.811
  cambian, ninguna de frenar a pasar, y todas las que pasan a frenar tienen un runner después de la imagen.
  Por el punto de entrada real, 379 comandos: todos con salida 0 o 2. Encontró que una sustitución anidada
  cortaba el comando antes de su cota; ahora se cierran de adentro hacia afuera.
- **La puerta entera**, `npm run ci`, con las ramas del guard cubiertas al 100.
- **Lo que no se corrió**: ningún contenedor, y una instancia real.
