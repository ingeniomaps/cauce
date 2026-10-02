---
caso: 232
titulo: nada acota los workers de las pruebas que lanza un agente
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 232 — Un agente que corre jest, vitest o nx sin cota de workers puede saturar la máquina

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: en roax-ops dos Review lanzaron `npx jest` a la vez y saturaron la máquina el 2026-08-31.

## Resumen

Fuera del commit, nada acota cuántos procesos lanza un runner de pruebas. roax-ops agregó un guard que frena jest/vitest/nx sin cota de workers, mirando la posición de comando, y un helper con candado de máquina para las corridas pesadas.

## Reproducción

Pendiente al tomar el caso: medir en un banco cuántos workers lanza `jest` sin `--maxWorkers` contra la cantidad de núcleos.

## Síntoma

La sesión muere por memoria con la corrida a medias.

## Causa raíz

No hay nada en `engine/hooks/` sobre workers ni `availableParallelism`.

## Fix propuesto

Un guard en `pre-shell` que pida la cota en los runners conocidos, con escape aprobable y no por variable de entorno, y el mismo candado que use `verify` (240).

## Tradeoffs

- Hay que medir qué cota respeta cada runner antes de exigirla.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/automatization/hooks/guard-load.sh` (225 líneas, con pruebas).

## Relacionados

- 240 — la misma cota dentro del commit.
- R26.

## Cierre

Resuelto en 0.100.0.

- **Medir antes qué cota respeta cada runner** — se hizo con la documentación de cada herramienta y no
  instalándolas, para no traer dependencias a la máquina. Lo consultado:
  - **jest** (jestjs.io/docs/cli, versión 30.5): `--maxWorkers`/`-w` con número o porcentaje; por defecto
    «the number of the cores available on your machine minus one» en una corrida y la mitad en modo watch.
    `--runInBand`/`-i` corre todo en serie.
  - **vitest** (vitest.dev/guide/cli, v5.0.3): `--maxWorkers` con número o porcentaje, y
    `--no-file-parallelism`.
  - **nx** (nx.dev, comandos): `--parallel` vale 3 por defecto.
- **Un guard en `pre-shell` que pida la cota en los runners conocidos** — se hizo: `test-workers`
  (`engine/hooks/workers.js`). Frena jest y vitest llamados sin cota, en posición de comando: directos, con
  `npx`/`bunx`/`pnpm exec`/`yarn`, por ruta, con variables de entorno delante o dentro de `bash -c "…"`. Deja
  pasar las cotas que acepta cada documentación, `--version`/`--help`, y `jest` nombrado dentro de un `grep`
  o de un mensaje de commit.
- **Con escape aprobable y no por variable de entorno** — se hizo. Se aprueba como el resto: diálogo de Claude
  Code o la línea exacta en `.ops-approval`.
- **El mismo candado que `verify`** — se decidió que no. El candado serializa los gates del commit, que corren
  suites enteras. Para lo que lanza un agente alcanza con la cota, y meterlo en el candado lo haría esperar
  detrás de cualquier commit de otra sesión.
- **nx queda afuera, con la razón escrita en el guard.** Su `--parallel` ya está acotado, y lo que multiplica
  son los jest que lanza cada tarea, que se cotan en la configuración del proyecto y no en la línea de comando.
- **Tradeoff: medir qué cota respeta cada runner** — cubierto por la documentación citada. No se midió en una
  máquina cuántos procesos lanza cada uno.

Lo que el caso no preveía:

- **`npm test` no se ve.** Corre lo que diga el script; eso lo cota el script del proyecto. Está dicho en el
  CHANGELOG.
- **La primera versión vaciaba lo que va entre comillas.** Eso dejaba pasar `bash -c "npx jest"`, que sí lo
  corre. Ahora la comilla cuenta como frontera de comando y no se vacía nada.

Prueba real:

- **Con el guard de shell instalado** desde esta rama en un banco, y una llamada con la forma real de Claude
  Code: `npx jest` respondió `permissionDecision: "ask"` con el motivo, `npx jest --maxWorkers=2` pasó sin
  salida, y `bash -c "npx vitest run"` pidió el diálogo.
- **Siete mutaciones en una copia, cada una en rojo por `test/hooks/test-workers.test.js`:**
  - Cualquier posición.
  - jest sólo con `--maxWorkers`.
  - Frenar `--version`.
  - vitest sin `--no-file-parallelism`.
  - Sin salida.
  - Sin las comillas como frontera.
  - Sin variables de entorno.

  Otra mutación, «sin vaciar comillas», sobrevivió, y por eso se encontró que vaciarlas era el defecto y se
  sacó.
