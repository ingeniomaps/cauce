---
caso: 399
titulo: el árbol de una línea comparte con el original los nombres fijos de su compose, y Cauce no lo avisa
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 399 — «Cada árbol es un checkout aparte» no vale para lo que el compose nombra a mano: contenedor, IP y volúmenes son los mismos que los del checkout de siempre

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Lo que se levante o se instale desde el árbol de la línea
puede caer sobre el contenedor de desarrollo del checkout principal, o chocar con él.

## Resumen

La documentación y la salida de `ops line` presentan el árbol como aislado: «Cada árbol es un checkout aparte, con
sus propias dependencias y sus propias pruebas» (`template/planning/delivery/teamwork.md:118`, y
`engine/cli/lines.js:195`). Es cierto para los archivos. No lo es para lo que el `docker-compose.yml` del repositorio
nombra con un valor fijo, porque el árbol tiene el mismo compose:

- `volumes: <x>: name: …` — el volumen es el mismo para los dos checkouts;
- `container_name` — un segundo `docker compose up` choca con el contenedor que ya existe;
- `ipv4_address` — dos contenedores no pueden tener la misma IP en la misma red.

## Reproducción

En una instancia real, el 2026-10-19, con el motor 0.111.0. Los compose de dos repositorios trabajados por líneas:

```
frontend-auth/docker-compose.yml:5    container_name: $CONTAINER_SLUG
frontend-auth/docker-compose.yml:22   - auth_ui_node_modules:/code/node_modules
frontend-auth/docker-compose.yml:32   ipv4_address: $CONTAINER_IP
frontend-auth/docker-compose.yml:42   name: frontend-auth-node-modules
admin/docker-compose.yml:17           - admin_node_modules:/code/node_modules
admin/docker-compose.yml:29           name: admin-node-modules
```

El árbol `lines/admin/admin` tiene el mismo compose y, con el `.env` copiado del original, los mismos valores.

## Síntoma

El runner de contenedores de la instancia arma un efímero desde el compose del proyecto, con sus volúmenes con
nombre. Sobre el árbol de la línea montaba `admin-node-modules`, el `node_modules` del contenedor de desarrollo, e
instalar ahí lo reemplazaba. Se vio leyendo el `docker run` que arma el runner, con una prueba que le da un compose
falso, y se arregló del lado de la instancia agregando el sufijo de la línea a los volúmenes. Con el arreglo, instalar
en los árboles creó `admin-node-modules-line-admin` y dejó `admin-node-modules` con el mismo contenido y fecha.

No se corrió un `docker compose up` desde un árbol: el choque de `container_name` y de la IP sale de cómo Docker
trata esos campos, no de una corrida.

## Causa raíz

`engine/cli/lines.js` arma el árbol sin mirar el compose del repositorio, y el texto que acompaña promete un
aislamiento que el compose no da.

## Fix propuesto

Lo que es de Cauce es la promesa, no el compose: el runner que montaba el volumen es de la instancia, y ahí se
arregló. Así que el arreglo es el texto: en `teamwork.md:118` y en la salida de `ops line` (`engine/cli/lines.js:195`),
decir que el árbol aísla los archivos y no lo que el repositorio nombra con un valor fijo fuera de git —volúmenes,
contenedores, IP, puertos—, y que eso se separa del lado del producto.

**Opcional, y a decidir aparte**: al armar cada árbol, si el repositorio tiene compose (`docker-compose.yml`, `compose.yml` y sus variantes), buscar
`container_name`, `ipv4_address` y volúmenes con `name:` y avisarlo: «`<repo>`: su compose fija `<campos>`; desde
este árbol un `up` o un contenedor de prueba usa los mismos que el checkout de siempre». Y en `teamwork.md`, una
línea junto a «checkout aparte» que diga lo mismo. No reescribir el compose: es del producto. Es heurístico —se lee YAML sin parser, porque no hay dependencias— y le
da al motor un conocimiento de Docker que hoy no tiene; por eso no entra con el texto.

La aceptación pide la mutación: con la frase quitada de la salida de `ops line`, la prueba que la busca falla. Si se
hace el aviso opcional, con la búsqueda quitada la prueba sobre un repositorio con un volumen con `name:` no encuentra
el aviso y falla.

## Tradeoffs

- Leer el compose sin `docker compose config` no resuelve variables (`$CONTAINER_SLUG`); alcanza con ver que el campo
  existe.
- Un repositorio sin compose no ve nada.

## Contexto de descubrimiento

Al instalar las dependencias de los árboles de tres líneas dentro de contenedores, que es lo que la salida de
`ops line` pide.

## Relacionados

- 398 — los hooks, otra cosa que el checkout aparte no trae.
- 326 — borrar volúmenes de Docker por su nombre; tema vecino, defecto distinto.

## Cierre

**Resuelto en 0.112.0.** `ops line` deja de prometer un aislamiento que el compose no da, y lo dice sólo donde
importa. `plant` (`engine/cli/lines.js`) mira si el árbol tiene alguno de los cuatro nombres que Compose busca
(`compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`), sin leer el archivo. Si lo tiene, avisa:
«`<repo>`: su compose, desde este árbol, es el mismo proyecto que desde el checkout de siempre, con los mismos volúmenes
y contenedores. Poné COMPOSE_PROJECT_NAME=`<repo>-<línea>` en el .env del árbol, sin copiar el del original; lo que el
compose fija a mano —name:, container_name, una IP— se separa del lado del producto.». El nombre va en minúsculas y con
guiones, como Compose lo acepta. La frase general vuelve a ser la de antes, y `template/planning/delivery/teamwork.md`
explica el porqué para quien lo lea sin correr `ops line`.

**Lo que el caso no preveía, y es más grande que lo que decía.** El caso hablaba de lo que el compose nombra a mano.
Medido con Docker Compose v2.29.2 (`docker compose config`, que no levanta nada), sobre el mismo compose en
`original/` y en `lines/x/original/`: los dos dan `name: original`. Compose toma el nombre del proyecto de la carpeta,
y el árbol se llama como el repositorio a propósito, para que `../` resuelva igual. O sea que desde el árbol **todo** el
proyecto es el mismo: también el volumen sin `name:` (`original_cache` en los dos) y los contenedores sin
`container_name`. Con `COMPOSE_PROJECT_NAME=original-line-x` en el `.env` del árbol, el proyecto, la red y el volumen
sin nombre pasan a `original-line-x`, y `container_name: app-web` y el volumen `name: app-node-modules` siguen iguales.
Y si el `.env` del original ya define `COMPOSE_PROJECT_NAME`, copiarlo al árbol copia también el choque: por eso el
aviso dice «sin copiar el del original».

El enunciado, ítem por ítem:

- **Corregir el texto de `teamwork.md` y de la salida de `ops line`**: se hizo. `teamwork.md` lleva la explicación
  entera; la salida lleva un aviso por repositorio con compose, con el valor concreto. Una primera versión decía lo
  mismo en la frase general, para todo repositorio; se cambió porque eran cuatro líneas de ruido donde no hay compose,
  y no daban el valor que separa.
- **El aviso que lee el compose**: se hizo distinto. No se lee el archivo: se mira si existe. Leerlo sería heurístico
  —YAML sin parser, porque no hay dependencias— y lo que choca primero, el nombre del proyecto, no está escrito ahí.
- **No reescribir el compose**: así. Tampoco se escribe el `.env` del árbol: es del producto, está ignorado por git y
  un `cp .env.example .env` lo pisaría.
- **La mutación**: cuatro, abajo.
- **Tradeoffs (variables sin resolver, repositorio sin compose)**: el primero deja de aplicar, porque no se lee el
  compose; el segundo es la prueba de que sin compose no se dice nada.

**Lo que se corrió para saber que funciona.**

- `test/wiring/lines.test.js`: sin compose, la salida no menciona compose; «el árbol de un repositorio con compose
  avisa que es el mismo proyecto, con el nombre que lo separa» avisa sólo por el repositorio que lo tiene, con
  `COMPOSE_PROJECT_NAME=front-app-web` para `Front.App` en la línea `web`, y reconoce los cuatro nombres de archivo
  mirando el árbol y no el original. Roja antes del cambio.
- Mutaciones en una copia fuera del árbol, las cuatro en rojo: sin el aviso; avisando siempre; mirando el checkout
  original en vez del árbol; sin normalizar el nombre del proyecto.
- Real, sobre `ops bench sidecar` con un `compose.yaml` commiteado en `app` (un servicio y un volumen sin nombre):
  - sin compose, `ops line` no dice nada de compose;
  - con compose, el motor de `main` no dice nada de compose y el de la rama imprime el aviso con
    `COMPOSE_PROJECT_NAME=app-web`;
  - `docker compose config` antes de seguirlo: `name: app` y `app_cache` desde el original y desde el árbol;
    después de poner `COMPOSE_PROJECT_NAME=app-web` en el `.env` del árbol: `name: app-web` y `app-web_cache` desde
    el árbol, y el original sigue en `name: app`.
- La medición de `docker compose config` del párrafo de arriba, que es lo que el aviso afirma.

**Lo que encontró la prueba y no es de este caso**: sumar a una línea un repositorio que ella misma había enlazado
falla con «ya existe y no es un worktree». Reproducido también con el motor de `main`; salió como el caso 408.

**Lo que encontró la revisión del conjunto**, antes del PR, y se arregló acá:

- **El aviso no se iba nunca**, ni después de seguirlo: salía en cada `ops line`, con el `.env` del árbol ya escrito. Ahora
  calla cuando el árbol tiene su propio `COMPOSE_PROJECT_NAME`, y propio quiere decir **distinto del del checkout de
  siempre**: un `.env` versionado que fija el nombre lo trae igual al árbol, y ahí el choque sigue y el aviso también.
- **El nombre sugerido podía no servir.** Se armaba con el repositorio y la línea, y `_infra` daba `_infra-web`. Con Docker
  Compose v2.29.2, `docker compose -p _infra-web config` sale con 15 e «invalid project name … must … start with a
  lowercase…», igual que `-infra-web`; `infra-web` y `9x_y` pasan. Ahora se le saca lo que no empieza con letra o dígito.

Probado así: la prueba de este caso suma las dos mitades del nombre propio y el repositorio `_infra`. Mutaciones en rojo:
sin comparar contra el original («calla con el nombre del original») y sin limpiar el comienzo. Real, por la CLI sobre la
instancia instalada: con `compose.yaml` en el árbol, avisa; con `COMPOSE_PROJECT_NAME=app-w` en el `.env` del árbol, no.

**Lo que encontró la tercera revisión**: un `COMPOSE_PROJECT_NAME=` vacío tomaba como nombre la línea de abajo (`\s*` cruza
el salto de línea), y el aviso callaba con un nombre que no es. Ahora el espacio que se admite es el de la misma línea.
Probado: la prueba de este caso suma `COMPOSE_PROJECT_NAME=\nDB_PORT=5432`, que avisa; la mutación con `\s*` sale roja («calla
con un nombre vacío»).
