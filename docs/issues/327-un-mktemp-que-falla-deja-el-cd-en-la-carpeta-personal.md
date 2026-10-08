---
caso: 327
titulo: un mktemp que falla deja el cd en la carpeta personal
estado: resuelto
resuelto-en: 0.104.0
prioridad: baja
version-detectada: 0.103.5
---

# 327 — `T=$(mktemp -d -p <no existe>); cd $T; echo x > a.js` escribe en la carpeta personal y el guard lo deja pasar

**🟢 resuelto en 0.104.0** · detectado en 0.103.5 · prioridad **baja**.

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

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **Contar cuántos comandos reales usan `;` — se hizo antes de elegir.** En los transcripts de esta máquina,
  lo que sigue a un `T=$(mktemp -d …)` es `&&` 8 veces, `;` 8 y un salto de renglón 7. Exigir `&&` frenaba la
  mitad de los usos legítimos, así que ese camino no se tomó solo.
- **Resolver sólo con `&&`, o comprobar que la carpeta exista — se hicieron los dos, combinados.** La variable
  se resuelve si vale una de tres cosas: la asignación sigue con `&&`; la carpeta ya está, es una carpeta y
  se puede escribir; o un paso anterior del mismo comando la crea con `mkdir -p`, nombrándola.
- **`mkdir -p X; T=$(mktemp -d -p X)` como forma legítima — se cuidó**, con `;` y en varios renglones.
- **La reproducción queda sin resolver y frena — se probó**: pasaba y ahora frena.
- **`T=$(mktemp -d) && cd $T && …` y `-p <raíz existente>` — como antes**, con `&&`, `;` y renglones.

### Qué se corrió

Doce cruces y trece usos legítimos por el guard de la versión anterior y por éste, en un banco fuera del
temporal. Diez cruces pasaban y ahora frenan: la carpeta que no existe con `;` y con salto de renglón, la
que no se puede escribir, un archivo en lugar de carpeta, la plantilla sin tres `X`, y cuatro formas de
nombrar `mkdir` sin crear esa carpeta. De los trece legítimos, once no cambian. Nueve mutaciones del módulo,
en una copia: las nueve en rojo.

### Lo que encontró y el enunciado no preveía

- **La primera versión miraba sólo si la carpeta existía, y daba por bueno cualquier comando con la palabra
  `mkdir`.** La revisión independiente la corrió contra 48 comandos y encontró once cruces abiertos —`echo
  mkdir` alcanzaba— y trece frenos de más. De ahí sale la forma de arriba.
- **Una plantilla sin tres `X` seguidas hace fallar a `mktemp` con la carpeta en su lugar.** Verificado con
  `mktemp` de coreutils: `mut` y `mut.XX` fallan, `mutXXX` crea. Queda sin resolver.

### Lo que no cubre

- **Un comando que rompe su propia carpeta antes de usarla**: `rm -rf X; T=$(mktemp -d -p X); cd $T; …` y lo
  mismo con `mv` siguen pasando. El guard mira el disco antes de que el comando corra.
- **Un `mkdir -p` que falla** —por permisos— deja el mismo hueco.
- **Frena dos formas que antes pasaban**: la carpeta creada por otra cosa que `mkdir -p` —`install -d`,
  `cp -r`, `git worktree add`— seguida de `;` o de un salto de renglón. Con `&&` pasan.

## Relacionados

- 318, 311 y 261.
