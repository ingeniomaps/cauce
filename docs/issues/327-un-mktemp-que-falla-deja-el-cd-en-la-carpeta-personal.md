---
caso: 327
titulo: un mktemp que falla deja el cd en la carpeta personal
estado: abierto
prioridad: baja
version-detectada: 0.103.5
---

# 327 — `T=$(mktemp -d -p <no existe>); cd $T; echo x > a.js` escribe en la carpeta personal y el guard lo deja pasar

**🔴 abierto** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: deja pasar una escritura fuera de las raíces, pero pide un `mktemp` que falle y un `;`
donde lo habitual es `&&`. No se vio en ninguna corrida.

## Resumen

El guard resuelve la variable de un `mktemp -d` por la carpeta que el comando nombra. Si `mktemp` falla, la
variable queda vacía, `cd` sin argumento va a la carpeta personal, y lo que sigue se escribe ahí.

## Reproducción

Lo mostró la revisión del caso 318, con el lector real y con bash:

```
T=$(mktemp -d -p <raíz>/no-existe); cd $T; echo x > a.js
   el guard juzga <raíz>/no-existe/mktemp/a.js y pasa.
   bash, con la carpeta personal apuntada a una falsa: queda en esa carpeta.
```

Con `&&` no ocurre: la asignación fallida corta la cadena.

## Causa raíz

`engine/hooks/input.js`, `assignedValues`: parte el comando por `;` y `&` sin distinguirlos, así que no sabe
si lo que sigue a una asignación depende de que haya salido bien.

## Fix propuesto

Dos caminos, y hay que medir cuál frena menos:

- Resolver la variable sólo cuando la asignación y el `cd` van unidos por `&&`.
- O comprobar que la carpeta nombrada exista. Deja sin resolver `mkdir -p X; T=$(mktemp -d -p X)`, que es
  una forma legítima.

## Por qué hacerlo

Es la misma mecánica que el 318 cerró para el `mktemp` sin `-d`, y va hacia el lado que deja pasar.

## Riesgos y regresiones

- **El primer camino frena la forma con `;`**, que aparece en comandos legítimos: `T=$(mktemp -d); cd $T; …`.
  Hay que contar cuántos comandos reales la usan antes de elegirlo.
- **El segundo depende del disco** en el momento en que corre el guard, que es antes del comando.

## Qué habría que probar

- La reproducción queda sin resolver y frena.
- `T=$(mktemp -d) && cd $T && …` y la copia con `-p <raíz existente>`: como hoy.

## Recomendación

**Hacerlo, sin apuro**, después de medir cuánto se usa la forma con `;`.

## Relacionados

- 318, 311 y 261.
