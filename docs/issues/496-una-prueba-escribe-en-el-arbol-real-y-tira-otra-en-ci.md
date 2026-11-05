---
caso: 496
titulo: Una prueba de evaluaciones escribe resultados en el árbol real y tira, a veces, la prueba del paquete
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 496 — Una prueba de evaluaciones escribe resultados en el árbol real y tira, a veces, la prueba del paquete

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**: falló 2 veces en 351 corridas de CI del último mes. Lo que pesa es que incumple R26 y que un rojo ajeno al PR se lee como un defecto del PR.

## Resumen

«Dos corridas el mismo día conviven y la segunda es la vigente» escribe dos registros de evaluación con fecha 2099 dentro de `agents/roles/system/qa-engineer/evaluations/results/` del repositorio real, y los borra en el `finally`. Otra prueba, que corre en paralelo, lee ese mismo directorio a través de una instalación enlazada al repositorio. Si alcanza a listar el archivo y la primera lo borra antes de que lo lea, falla con `ENOENT`.

Hay dos daños:

1. **Un rojo que no es del PR.** El 2026-11-05 frenó dos firmas de propuestas mensuales, cuyos diffs eran sólo un `.md` de otro cargo, hasta que se comprobó que era esta carrera.
2. **El árbol que se juzga se escribe.** Si la prueba se corta entre el `writeFileSync` y el `finally`, queda un `2099-03-01.md` dentro de un cargo del sistema, que es lo que viaja en el paquete.

## Reproducción

**No se reprodujo en local:** es una carrera de baja frecuencia. Lo que la sostiene son dos ocurrencias reales en CI, con su log:

- Corrida `39529688573`, `main`, 2026-10-21.
- Corrida `42113492483`, job `127546901782` (`ci (current)`), rama de la propuesta de accounting-specialist, 2026-11-05. El mismo commit pasó en `ci (24)`.

## Síntoma

Del log del job `127546901782`:

```
✖ roles/qa-engineer (165.624986ms)
✖ todos los agentes se resuelven desde el paquete y pasan sus controles (8607.65262ms)
  AssertionError [ERR_ASSERTION]: ENOENT: no such file or directory, open '/tmp/cauce-test-2604-3jDbsb/cauce-agents-1/demo-ops/node_modules/@ingeniomaps/cauce/agents/roles/system/qa-engineer/evaluations/results/2099-03-01.md'
```

**Frecuencia, medida el 2026-11-05.** Se tomaron las corridas del workflow `ci.yml` desde el 2026-10-06 (395 en total, 351 con jobs: 314 en verde y 37 en rojo) y se buscó `ENOENT.*evaluations/results/2099` en el log de los 29 jobs fallidos que todavía lo tienen: aparece en 2.

## Causa raíz

- `test/agents/evaluations.test.js:122-148`: `resultsDir(REPO, 'qa-engineer')` es el directorio real del cargo. Escribe `2099-03-01.md` y `2099-03-01-2.md` ahí (`:130`, `:133`) y los borra en el `finally` (`:147-148`).
- `test/agents/agents.test.js:20`: «todos los agentes se resuelven desde el paquete…» monta un proyecto con `installedProject` (`test/support/agents-fixtures.js:19-24`). Su `node_modules/@ingeniomaps/cauce` es un symlink al repositorio real (`test/support/environment.js:145-148`), así que lista y lee el mismo directorio.
- `package.json:33`: `node --test "test/**/*.test.js"` corre los archivos en paralelo.

## Fix propuesto

Que la prueba de `evaluations.test.js:122` escriba en una raíz temporal con un cargo copiado o fabricado, como hacen las demás pruebas de `test/agents/`, y no en `REPO`. `nextResult` y `latest` reciben la raíz como argumento, así que no hace falta tocar el motor.

**Prueba de que el arreglo cierra el caso:**

- Una aserción de ausencia que falle si una prueba deja algo nuevo bajo `agents/` del repositorio, por ejemplo comparando `git status --porcelain agents/` antes y después de la suite.
- Esa aserción se ve en rojo devolviendo la escritura a `REPO`.

## Tradeoffs

- La prueba deja de ejercitar el directorio real del cargo. Lo que mide —el sufijo `-N` y cuál corrida es la vigente— no depende de eso.
- La aserción de ausencia sobre `agents/` puede dar falsos rojos en un árbol con cambios locales sin commitear. Hay que compararla contra el estado de antes de la suite, no contra un árbol limpio.

## Contexto de descubrimiento

Al autorizar el CI de las propuestas mensuales del 2026-11, el 2026-11-05: dos PR quedaron en rojo en una sola de las dos versiones de Node.

En el otro rojo de ese día (corrida `42116148893`, job `127556208809`, `ci (24)`, rama de la propuesta de qa-engineer) falló «un archivo nombrado por su nombre no se aprueba en todos los repositorios que lo tienen», una prueba del guard de `.ops-approval`. Aparece una sola vez en los 29 jobs revisados, así que **no sale como caso propio**. Si vuelve a aparecer, se abre con el conteo.

**Lo que no se miró:** el grep que buscó otras pruebas que escriben en el árbol real —escrituras sobre `REPO` y rutas que no son temporales— sólo encontró ésta, pero no es exhaustivo.

## Relacionados

R26 (`template/planning/rules/system/runs.md`): una puerta no escribe en el árbol que juzga. R23 (`conduct.md`): los bancos son desechables.
