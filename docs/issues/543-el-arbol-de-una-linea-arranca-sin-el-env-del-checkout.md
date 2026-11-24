---
caso: 543
titulo: el árbol de una línea arranca sin el `.env` del checkout de siempre, y `ops line` pide escribir en uno que no existe
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 543 — el árbol de una línea arranca sin el `.env` del checkout de siempre, y `ops line` pide escribir en uno que no existe

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: cada línea nueva de un producto con `.env` arranca con los
servicios locales sin configurar, y nada lo dice. Una instancia real construyó una herramienta propia para resolverlo
(222 líneas). Su encabezado da la razón: con una clave rotada, el árbol con el `.env` viejo contesta 401 en cada
llamada local.

## Resumen

Un worktree trae lo que git versiona. El `.env` y el `.env.local` de un producto casi siempre están ignorados, porque
llevan claves, así que el árbol de `lines/<línea>/<repo>/` arranca sin ellos.

`ops line` no lo dice. Dice «sus dependencias se instalan adentro», que es la otra mitad de lo que un checkout nuevo no
trae. Y cuando hay compose, pide «Poné COMPOSE_PROJECT_NAME=app-pagos en el .env del árbol», sobre un archivo que todavía
no existe (`engine/cli/lines.js:148-152`).

## Reproducción

Sin modelo, en un banco sidecar (`repro-543.sh` en el scratchpad de la sesión). El producto tiene `.env` y `.env.local`
ignorados y un `compose.yaml`; después se arma la línea:

```
== original: 2 archivos .env*
✓ …/lines/pagos/app  (line/pagos)
  sale de: master
La línea pagos se lleva desde esta misma sesión, en otra conversación: … Cada árbol es un checkout aparte: sus
dependencias se instalan adentro.
⚠ app: su compose, desde este árbol, es el mismo proyecto que desde el checkout de siempre, … Poné
COMPOSE_PROJECT_NAME=app-pagos en el .env del árbol, sin copiar el del original; …
== árbol …/lines/pagos/app
. .. .git .gitignore compose.yaml src
== .env* en el árbol: 0
```

## Síntoma

Quien abre la línea corre los servicios desde el árbol y fallan por configuración: falta una clave, la base es otra, el
puerto es el de otro. Lo que hace después es copiar el `.env` a mano. Esa copia envejece en silencio: cuando la clave
rota en el checkout de siempre, el árbol sigue con la vieja, que es el 401 que la instancia describe.

## Causa raíz

El caso 399 decidió que Cauce no escribe el `.env` del árbol: «es del producto, está ignorado por git y un `cp
.env.example .env` lo pisaría». Esa decisión cuida no pisar nada, pero dejó el hueco sin aviso. El árbol nace sin la
configuración, y la única mención del `.env` en la salida da por sentado que ya está.

## Fix propuesto

Dos formas. La segunda revierte en parte el 399, así que va como decisión:

1. **Avisar, sin escribir.** `ops line` mira qué archivos `.env*` ignorados tiene el checkout de siempre y el árbol no, y
   los nombra. Sólo los nombres: no lee el contenido. Por ejemplo: «app: el checkout de siempre tiene .env y .env.local,
   que git ignora y el árbol no trae. Copialos, y en el .env poné COMPOSE_PROJECT_NAME=app-pagos». El aviso de compose se
   une a ése. No cambia lo que el 399 decidió.
2. **Copiarlos a pedido.** `ops line … --env` copia al árbol cada `.env*` ignorado del original que el árbol no tenga, sin
   pisar uno que ya exista. Si hay compose, deja el `COMPOSE_PROJECT_NAME` de la línea en el `.env` copiado.
   `ops lines env <línea>` dice qué archivo del árbol difiere del original, por nombre de clave y nunca por valor, y con
   `--apply` lo copia de nuevo, guardando el anterior fuera de los repositorios. Es lo que hace la instancia.

## Decisión

**¿Hasta dónde llega Cauce con el `.env` de un árbol?**

- **La 1 sola.** Avisar con los nombres. El 399 queda como está y la copia la hace la persona.
- **La 1 y la 2.** El aviso siempre, y la copia y la comparación a pedido, con `--env`. Cauce pasa a escribir un
  archivo con claves del producto, con quien lo pide como autorización.

**Decidido (Manuel, 2026-11-22, sobre esta recomendación): la 1 y la 2.** El aviso solo deja el trabajo y el envejecimiento donde están, y la instancia ya mostró
que la copia a mano se pudre. A pedido no pisa nada: sólo copia lo que falta, y para lo que ya existe dice qué difiere.

## Tradeoffs

- **Secretos.** El motor copiaría archivos con claves. No los imprime: la salida y la comparación nombran claves, nunca
  valores, y la copia no pasa por la sesión del agente, que nunca ve el contenido. El guard `secrets-shell` sigue
  frenando a un agente que quiera leer el `.env`. Que el comando del motor no lo dispare se prueba.
- **Qué es un `.env*`.** Los ignorados por git cuyo nombre empieza con `.env`, y no `.env.example`, que está versionado.
  Si un producto usa otro nombre (`config/local.json`), no lo ve. Se declara en `ops.config.json` si hace falta, no
  antes.
- **El 399.** Su razón era no pisar nada, y la 2 se cuida de eso: copia sólo lo que falta, y lo demás lo compara.
- **Borrar la línea** con `git worktree remove` se lleva el `.env` del árbol sin avisar (verificado con git 2.53). Es una
  copia, salvo que se haya editado a mano en el árbol. Lo trata el caso 544, que es el que desarma.

## Contexto de descubrimiento

Paso 4 de la auditoría de una instancia (2026-11-22), ítem 13 del nivel 2: «entorno por línea». La herramienta de la
instancia (`line-env`) sincroniza `.env` y `.env.local` desde el checkout de siempre, guarda el anterior y reporta sólo
nombres de clave. Su variante con un gestor de secretos y una plantilla es propia de ese proyecto.

## Relacionados

- 399: el nombre del proyecto de compose de un árbol, y la decisión de no escribir el `.env`.
- 394: las líneas de trabajo.
- 544: lo que una línea arma y desarma del lado del producto.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto 1, avisar sin escribir** — se hizo. `ops line` nombra los `.env*` de la raíz del checkout de siempre
  que git ignora y el árbol no trae, sin leer su contenido. Se reconocen con `git check-ignore`, así que una plantilla
  versionada no cuenta. El aviso de compose dice además que `--env` deja el nombre al copiar.
- **Fix propuesto 2, copiar a pedido** — se hizo, en `engine/cli/line-env.js`:
  - `ops line … --env` copia lo que falta y nunca pisa lo que está. Si hay compose, deja `COMPOSE_PROJECT_NAME` de la
    línea una sola vez, aunque el original repita la clave.
  - `ops lines env <ops-root> <línea>` compara por clave y nunca por valor. Ignora el nombre de proyecto, que es
    distinto a propósito, lee CRLF, y sale con 1 si algo difiere.
  - Con `--apply` copia el original y guarda el anterior en `lines/<línea>/.env-prev/<repo>/<archivo>.<hora>`, fuera
    de los repositorios. Dos aplicaciones guardan dos respaldos.
  - Se hizo distinto en un punto que el caso no preveía: sólo se toca un archivo regular, mirado con `lstat`, de los dos
    lados. Un `.env` que es un enlace o una carpeta se nombra y no se sigue ni se escribe, y antes de copiar se borra el
    destino, para no escribir a través de un hardlink. La primera versión seguía un enlace y dejaba las claves en un
    archivo de afuera del árbol.
- **Decisión: las dos formas** — decidido por Manuel el 2026-11-22.
- **Tradeoffs: secretos** — hecho, y probado. Ningún camino imprime un valor: el texto, `--json` y los avisos nombran
  archivos y claves. Las dos revisiones lo comprobaron. El guard `secrets-shell` deja correr `ops line --env` y
  `ops lines env --apply`, y sigue frenando `cat app/.env`, con su prueba. Lo que no frena es un `cp` del `.env` a
  mano. Eso ya era así antes y queda anotado acá.
- **Tradeoffs: qué es un `.env*`** — se mantuvo: los ignorados de la raíz cuyo nombre empieza con `.env`. Un repositorio
  en una subcarpeta (`grupo/app`) funciona, y lo comprobó la revisión. Otro nombre de archivo no se ve, y no se declara
  hasta que alguien lo pida.
- **Tradeoffs: el 399** — hecho. La copia no pisa nada. `composeNamed` compara ahora el proyecto como lo normaliza
  Compose, así que un `"app"` entre comillas ya no apaga el aviso del 399, que era un defecto de antes de este caso.
- **Tradeoffs: borrar la línea se lleva el `.env`** — lo trata el 544: el retiro en seco lo avisa.

Lo que se corrió:

- Línea de base, en «Reproducción»: el árbol con 0 `.env*` y la salida que pedía escribir en uno inexistente.
  Antes y después lado a lado, en `repro-543-before.log` y `repro-543-after.log` del scratchpad.
- `test/wiring/line-env.test.js`, 15 pruebas (las del 543 y las del 544), las del 543 en rojo contra el código de HEAD.
  Las de líneas que ya había siguen en verde.
- 26 mutaciones en una copia, las 26 rojas y la copia sin mutar verde. Dos que sobrevivieron mostraron que sobraban la
  exclusión de la plantilla por nombre y el `chmod`, y se quitaron. Las demás que sobrevivieron sumaron su caso.
- Banco sin modelo, sobre la versión final: un sidecar con `.env` y `.env.local` ignorados y un compose. Se corrió el
  aviso, `--env`, `lines env` igual y con una clave rotada, `--apply` con su respaldo, y una segunda vez `--env`, que
  no pisó nada.
- `npm run ci` con los archivos nuevos stageados: 1898 de 1898, exit 0.

**Sin probar:** un producto real con Docker levantando el proyecto `app-pagos` desde el árbol. El banco no corre
Docker. Que `COMPOSE_PROJECT_NAME` del `.env` separa el proyecto lo verificó la revisión con Compose 2.29.2 y
`docker compose config`, y está documentado en docs.docker.com. Un `.env` del original que es un enlace se saltea sin
avisar; es el lado seguro.

### Lista de cierre

1. hecho: la reproducción de «Reproducción», antes y después en el scratchpad.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo contra HEAD y en verde después.
4. hecho: 26 mutaciones en una copia, las 26 rojas; las que sobrevivieron se contestaron con un caso o quitando lo que sobraba.
5. hecho: cambia la salida de `ops line`, que ya no pide escribir en un `.env` que no existe; la prueba del aviso sin `--env` y el antes y después lado a lado lo muestran. Lo demás agrega y no quita.
6. hecho: banco sin modelo con la CLI real, sin dobles; se midió que el árbol ya no queda sin `.env` cuando se pide y que lo que difiere se ve.
7. no aplica: no depende de un modelo ni de un runner; Docker queda en «Sin probar», con la verificación que hizo la revisión.
8. hecho: «Lo que se corrió» enumera los caminos; las mutaciones, el banco y la puerta corrieron sobre la versión final.
9. hecho: dos lados de cada comparación (original y árbol), dos archivos (`.env` y `.env.local`), dos aplicaciones con dos respaldos.
10. hecho: dependían el aviso de compose de `lines.js`, `teamwork.md`, `ops worktree --line` y `lines migrate`, que llaman `assemble` sin `--env` y sólo avisan; se corrigió el aviso y se documentó en `teamwork.md`.
11. hecho: cuatro pasadas de revisión independiente sobre el 543 y el 544. La primera halló que `--apply` seguía un enlace, que no se leía el CRLF y que el retiro podía aconsejar bajar el proyecto del checkout de siempre; la segunda y la tercera, más formas de eso último y un hardlink. Todo se arregló, y la última no halló nada que impida entregar.
12. hecho: pasada de comentarios; se movió a `line-env.js` el porqué del compose que quedaba sin su constante en `lines.js`, y se quitaron dos que justificaban código que se fue.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1898 de 1898, exit 0.
14. hecho: este cierre recorre los dos Fix propuestos, la Decisión y los Tradeoffs.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0 («Agregado»).
