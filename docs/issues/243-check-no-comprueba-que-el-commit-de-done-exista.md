---
caso: 243
titulo: check no comprueba que el commit de done exista
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 243 — `check` valida la forma del `commit:` de una entrada de `done/`, no que el sha exista

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: en roax-ops un runner cerró una tarea con un hash fabricado, y la evidencia es lo que se audita.

## Resumen

La traza `commit:` de `done/` se valida por forma (`<sha> <asunto>`). roax-ops agregó a su `check` una pasada con `git cat-file -e` en el repositorio del servicio.

## Reproducción

Pendiente al tomar el caso: una entrada con `commit: deadbeef feat: algo` en un banco; se espera que `check` salga verde.

## Síntoma

Una tarea queda «hecha» con evidencia que no existe.

## Causa raíz

`engine/planning/contracts.js`, `validCommitTrace`: sólo prueba la forma con `COMMIT_TRACE`.

## Fix propuesto

Resolver el repositorio por el `service:` de la entrada contra `workspaceRoots` y comprobar el sha; si el repositorio no está en la máquina, avisar en vez de fallar.

## Tradeoffs

- Cuesta un `git` por entrada: acotarlo a las entradas nuevas o hacerlo advertencia.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/planning/check.js` §14.

## Relacionados

- Se abrió como 230 y se renumeró a 243: otra sesión publicó antes su propio 230.

- R9 — el artefacto manda.

## Cierre

Resuelto en 0.100.0.

- **Reproducción, antes de tocar nada:** una instancia sidecar con una entrada de `done/` que cita `deadbee` y
  otra con un sha real. Con el motor de `main`, `check` salió `ok=true` sin una palabra sobre ninguna de las dos.
- **Resolver el repositorio y comprobar el sha** — se hizo distinto de lo propuesto. No se resuelve por el
  `service:` de la entrada sino por el repositorio que nombra la traza —`(backend-auth@rama)`, la forma que fija
  el molde de `done/`—, buscado dentro de cada raíz declarada. Sin nombre, se busca en las raíces que son
  repositorios. Hace una sola llamada a `git cat-file --batch-check` por repositorio, con todos sus shas, que
  acepta shas abreviados y dice el tipo: un sha que resulta ser un blob tampoco cuenta (comprobado con git
  2.43.0). Está en `commitStatus` (`engine/core/repos.js`) y en `unknownCommitWarnings`
  (`engine/planning/done-commits.js`).
- **Avisar en vez de fallar si el repositorio no está** — se hizo, y en dos niveles. El sha que su repositorio
  no tiene se avisa por entrada. Lo que no se puede mirar —repositorio no clonado, o traza sin repositorio y
  ninguna raíz que lo sea— va en una sola línea con los nombres.
- **Tradeoff: cuesta un `git` por entrada** — se hizo distinto: cuesta uno por repositorio. Medido sobre roax:
  262 ms el `check` de `main` y 278 ms con esto.

Lo que el caso no preveía, y lo encontró la corrida contra una instancia real:

- **Una raíz puede ser una carpeta con varios repositorios.** En roax, `..` es `servers/`, que no es un
  repositorio. La primera versión buscaba sólo en las raíces y no comprobó ninguno de los 253 shas.
- **Sin separar lo no comprobable, el aviso era ruido.** La segunda versión daba 64 avisos: 55 de dos
  repositorios que no están clonados en esta máquina (`roax-ads-back`, `roax-ads-front`) y 9 trazas sin
  repositorio nombrado. Ninguno era un hash fabricado comprobado, así que pasaron a una sola línea.
- **`contracts.js` pasaba las 500 líneas** con la función adentro, y se movió a su módulo.

Prueba real:

- **La reproducción con el motor de esta rama:** `check` sigue `ok=true` y avisa `done/tarea-inventado.md
  tarea-inventado: el commit deadbee no está en su repositorio…`; de la real no dice nada.
- **Contra `roax-ops`, sólo lectura:** de 253 shas, 150 se comprobaron y existen todos, y 103 salieron en la
  línea «no se comprobaron porque su repositorio no está en esta máquina (roax-ads-back, roax-ads-front, sin
  repositorio nombrado)».
- **Cinco mutaciones en una copia, cada una en rojo por `test/planning/done-commits.test.js`:**
  - Un blob cuenta como commit.
  - Buscar el repositorio como la primera versión.
  - Lo no comprobable como faltante.
  - Sin la línea de resumen.
  - `check` no lo muestra.
