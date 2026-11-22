---
caso: 543
titulo: el árbol de una línea arranca sin el `.env` del checkout de siempre, y `ops line` pide escribir en uno que no existe
estado: abierto
prioridad: media
version-detectada: 0.124.0
---

# 543 — el árbol de una línea arranca sin el `.env` del checkout de siempre, y `ops line` pide escribir en uno que no existe

**🔴 abierto** · detectado en 0.124.0 · prioridad **media**: cada línea nueva de un producto con `.env` arranca con los
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
