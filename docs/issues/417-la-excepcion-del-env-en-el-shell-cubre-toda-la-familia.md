---
caso: 417
titulo: la excepción del .env en secrets-shell cubre toda la familia, también .env.keys y .env.production, que la edición frena
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.112.0
---

# 417 — Desde el shell se escribe cualquier `.env.*` sin aprobación, mientras la herramienta de edición frena los mismos archivos

**🟢 resuelto en 0.112.0** · detectado en 0.112.0 · prioridad **media**. Pedía una decisión: la excepción la decidió el caso 405 con su razón,
y achicarla cambia qué setup se frena.

## Resumen

El caso 405 hizo que escribir una credencial por el shell frenara como con la herramienta de edición, con una sola excepción
declarada: la familia `.env` (`ENV_FILE`, `engine/hooks/files.js`). Su razón es `cp .env.example .env`, el paso de setup de casi
todo repositorio. Pero `ENV_FILE` es `^(?:\.env|\.env\..+)$`, así que la excepción también cubre `.env.keys`, donde dotenvx
guarda la clave privada, y `.env.production`.

## Reproducción

El 2026-10-20, con el motor de la rama `fix/cases-396-406`, `secrets-shell` y `secrets` por `execute` sobre una raíz con
`planning/`:

| Archivo | `echo K=v > <archivo>` por el shell | La herramienta de edición |
|---|---|---|
| `.env` | pasa | frena: «parece contener secretos» |
| `.env.keys` | pasa | frena, igual |
| `.env.production` | pasa | frena, igual |
| `.env.example` | pasa | pasa |

## Causa raíz

`engine/hooks/secrets-shell.js`, `writtenCredentials`: `if (ENV_FILE.test(path.basename(raw))) continue`, que es la familia
entera.

## Fix propuesto

Las salidas, para decidir:

1. **Achicar la excepción a lo que su razón cubre**: `.env` y `.env.local`, lo que una plantilla arma en el setup. El resto
   de la familia frena como en la edición y se aprueba por archivo o por el chat.
2. **Eximir la escritura, no el nombre**: pasar sólo cuando lo que se escribe sale de una plantilla
   (`cp .env.example .env`, `cp .env.sample .env.local`). Más preciso, y más lectura del comando para mantener.
3. **Dejarla como está**, documentando que el shell no cuida la familia `.env`.

La recomendación es la 1: es la razón escrita del 405, sin la parte que no cubre.

La aceptación pide la mutación: con la excepción devuelta a toda la familia, la prueba que escribe `.env.keys` por el shell
tiene que ver que pasa y fallar; y `cp .env.example .env` tiene que seguir pasando.

## Tradeoffs

- Un setup que arma `.env.development` desde su plantilla pasa a preguntar con la 1, y no con la 2.

## Contexto de descubrimiento

La segunda revisión del conjunto de la tanda 396–415, el 2026-10-20.

## Relacionados

- 405 — la excepción y su razón.

## Cierre

**Resuelto en 0.112.0, con la salida 1, que decidió el dueño del producto el 2026-10-20.** La excepción de
`writtenCredentials` (`engine/hooks/secrets-shell.js`) pasó de la familia entera a `SETUP_ENV`, `.env` y `.env.local`: lo que
una plantilla arma en el setup. El resto de la familia frena como en la herramienta de edición, y se aprueba igual, por
archivo o por el chat.

El enunciado, ítem por ítem:

- **Las tres salidas**: se tomó la 1. La 2 —eximir sólo lo que sale de una plantilla— quedaría más precisa, pero obliga a leer
  de dónde viene cada escritura, y la 1 ya cubre la razón escrita del 405.
- **La mutación**: abajo, en los dos sentidos.
- **Tradeoff, un `.env.development` armado desde su plantilla ahora pregunta**: así queda. La prueba lo fija: `cp
  .env.example .env.development` frena.

Lo que se movió con la quita (R9): `ENV_FILE` se exportaba desde `files.js` sólo para esta excepción, y lo había agregado el
405 en esta misma rama. Sin quién lo use, `files.js` volvió a como estaba en `main`. `automatization/hooks/README.md` decía
que la excepción era «la familia `.env`» y ahora nombra los dos archivos, y el cierre del 405 remite acá.

**Lo que se corrió para saber que funciona.**

- `test/hooks/secrets-shell.test.js`, «secrets-shell frena escribir una credencial por shell como escritura, y no como
  lectura»: `.env.keys`, `.env.production` y `.env.development` frenan con «parece contener secretos»; `cp .env.example .env`,
  `>> .env` y `cp .env.sample .env.local` pasan. Roja antes del cambio («Missing expected exception»).
- Mutaciones en una copia fuera del árbol, las dos en rojo: la excepción de vuelta a toda la familia («Missing expected
  exception»); y sólo `.env` («Got unwanted exception: cp .env.sample .env.local»).
- **Real, con `claude -p --permission-mode bypassPermissions`** en la instancia instalada desde el tarball:
  `echo DOTENV_PRIVATE_KEY=x > app/.env.keys` sale «BLOQUEADO: …/app/.env.keys parece contener secretos» y el archivo no
  existe; `cp app/.env.example app/.env` y `cp app/.env.example app/.env.local` se hacen.
