---
caso: 313
titulo: un contenedor con tope de recursos no cuenta como acotado
estado: abierto
prioridad: baja
version-detectada: 0.103.5
---

# 313 — `docker run --memory 4g --cpus 4 … jest` se frena por «jest sin cota de workers»

**🔴 abierto** · detectado en 0.103.5 · prioridad **baja**.

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
