---
caso: 153
titulo: El `node_modules` enlazado que verify usa rompe cualquier build de Turbopack, y el proyecto no tiene forma de compensarlo
estado: abierto
prioridad: alta
version-detectada: 0.89.0
---

# 153 — Turbopack rechaza el enlace que `commitTree` necesita, así que el gate de un proyecto Next no puede pasar

**🔴 abierto** · detectado en 0.89.0 · prioridad **alta** — bloquea todo commit de un proyecto Next moderno
siempre que árbol e índice difieran, y a diferencia del **151** no hay ajuste del proyecto que lo evite

> **Medido el 2026-09-15 sin arreglarlo.** De las tres opciones que este caso proponía, dos quedaron
> cerradas —la 2 descartada por medición, la 3 ya existía desde 0.74.0 con su premisa equivocada— y la
> que queda no es un arreglo sino un cambio de contrato, que salió como **156**. El defecto sigue en pie:
> por eso esto no se cierra.

## Resumen

`commitTree` (`engine/hooks/shell.js`) materializa el índice en un temporal y **enlaza** lo ignorado que un
gate no puede fabricar: `node_modules`, `.env`, credenciales. La decisión está bien razonada —sin
`node_modules` no corre ningún gate— y funciona para `vitest` y `eslint`.

No funciona para `next build`. Turbopack se niega a seguir un symlink que apunte afuera de la raíz del
proyecto:

```
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid,
it points out of the filesystem root

Debug info:
- Execution of find_package failed
- Symlink [project]/node_modules is invalid, it points out of the filesystem root
[ELIFECYCLE] Command failed with exit code 1.
```

Reproducido a mano replicando exactamente lo que hace `commitTree`: `checkout-index -a --prefix=$T/`,
`ln -s <proyecto>/node_modules $T/node_modules`, `pnpm run build` adentro.

## Reproducción

1. Proyecto Next 16 con `next build` entre los gates del servicio (Turbopack es el default).
2. Cualquier archivo sucio en el árbol que no esté en el índice — basta uno ajeno al commit.
3. Commitear. `test` y `lint` pasan dentro de la copia; `build` vuelve en **2,2 s** con `[ELIFECYCLE]`.

El guard informa sólo el código de salida, así que el mensaje de arriba no se ve: hay que replicar la copia
para leerlo. En el árbol, el mismo contenido compila en 3,6 s y genera sus 5 páginas estáticas, exit 0.

## Síntoma

Los dos gates que pasan hacen el fallo más difícil de leer, no más fácil: con `test` y `lint` en verde, un
`build` en rojo parece un problema de compilación del cambio. Y el tiempo lo delata sólo si alguien lo
mira — 2,2 s para un build que tarda segundos de compilación más la generación estática.

**Y no hay salida del lado del proyecto.** El **151** se compensa declarando un ajuste de pnpm en el
repositorio; acá no existe el equivalente: Turbopack no tiene una opción para aceptar el enlace, y volver a
webpack sería degradar el producto para satisfacer al andamio. Quedan sólo las dos salidas que el bloqueo
ofrece —aprobar las rutas, o `OPS_SKIP_VERIFY=1`—, y las dos significan commitear sin haber corrido el
gate sobre lo que se graba, que es justo lo que el mecanismo vino a garantizar.

## Causa raíz

El enlace es la mitad deliberada del arreglo de `commitTree`: lo ignorado que el gate no puede fabricar
viaja por enlace para no copiar gigabytes. Turbopack, en cambio, valida que todo lo alcanzable esté bajo la
raíz del proyecto, y un symlink absoluto hacia afuera no lo está.

## Fix propuesto

1. **No materializar cuando el delta no puede cambiar el veredicto.** Hoy alcanza un archivo sucio
   cualquiera para materializar. Si las rutas que difieren entre árbol e índice no están en el alcance del
   gate —un `tsconfig.json` de otra sesión, un README—, correr en el lugar es lo mismo y no rompe nada. Es
   la salida más barata y la que más casos cubre.
2. ~~**Montar `node_modules` dentro de la raíz en vez de enlazarlo hacia afuera**: un *bind mount* donde el
   sistema lo permita, o un enlace **relativo** que quede bajo la raíz de la copia.~~ **La mitad barata está
   descartada por medición** (2026-09-15). Un enlace relativo no cambia a dónde llega, sólo cómo se escribe:

   | forma | ¿resuelve dentro de la copia? |
   | --- | --- |
   | absoluto hacia afuera, lo que hace hoy `commitTree` | **no** |
   | relativo (`../proyecto/node_modules`) | **no** — y el gate igual lo lee |
   | copiado adentro | sí |

   Turbopack rechaza por el **destino**, así que el relativo no lo evita. Lo único que deja `node_modules`
   bajo la raíz es copiarlo, que es exactamente lo que `commitTree` evita para no copiar gigabytes por
   commit. Queda el *bind mount*, que el propio caso ya señala como lo menos portable —y el **069** lo
   descartó por eso mismo: en dos de las tres plataformas no hay equivalente directo—.
3. ~~**Que el guard muestre la salida del gate cuando falla en menos de N segundos.**~~ **Ya existe, y la
   premisa de este punto estaba equivocada.** El bloqueo muestra la primera línea de error del gate desde
   **0.74.0** —`030bd544`, quince versiones antes de la que este caso midió— junto con la duración y el
   aviso de que volver en menos de 2 s no alcanza para correr una suite. La cita a «el 142» era errónea: el
   142 es sobre propuestas firmadas sin salida. El caso de esta familia es el **094**.

   Lo que **no** queda establecido es por qué quien escribió este caso no vio esa línea, y se declara en vez
   de suponerse: `run()` compone `stdout` entero y después `stderr` entero —no intercalados— y `fallo()`
   elige la primera línea que matchea `ERROR_LINE` entre las que no empiezan con `>`. Con una salida real de
   Next, cualquier línea de `stdout` que contenga «error» o «fail» gana antes que el `TurbopackInternalError`
   de `stderr`. Medirlo pide la salida real de un `next build`, que no se tiene acá.

El 1 es lo único que queda en pie, y **no es un arreglo sino un cambio de contrato**: salió como caso
propio, el **156**.

## Tradeoffs

El 1 cambia cuándo se confía en el árbol, que es exactamente la garantía que `commitTree` fue a construir:
hay que definir «en el alcance del gate» sin adivinar, y lo honesto es por ruta declarada en
`ops.config.json` y no por heurística. El 2 es más fiel al diseño actual pero depende de qué acepte cada
herramienta, así que su verde no se puede afirmar sin medirlo con Turbopack delante.

**Y ese último tradeoff se cobró solo.** La mitad barata del 2 —el enlace relativo— se midió y no llega a
Turbopack: falla antes, en que sigue resolviendo afuera de la copia. O sea que no hizo falta Turbopack para
descartarla, y la predicción de que «su verde no se puede afirmar sin medirlo» era correcta por una razón
más simple que la prevista.

## Prioridad

**Alta, y ahora con un solo camino.** Sigue bloqueando todo commit de un proyecto Next cuando árbol e índice
difieren, y lo único que puede destrabarlo es el **156**: mientras `node_modules` viaje por enlace, la copia
rompe el build, y mientras cualquier archivo sucio fuerce la copia, basta un README suelto para dejar sin
gate a quien commitea. Baja el día que el 156 se resuelva, o si aparece una vía sobre el enlace que estas
mediciones no cubrieron —el *bind mount* sigue sin medirse, y sigue siendo lo menos portable—.

## Contexto de descubrimiento

2026-09-14/15, commiteando la tarea `env-schema-yaml` de una instancia sidecar. El fallo apareció después
de resolver el **151**: con pnpm ya sin motivo para reinstalar, `test` y `lint` pasaron dentro de la copia y
quedó este solo.

**Y lo que forzaba la materialización era un residuo del propio recorrido, no un archivo ajeno.** Su fase
Review corrió `NEXT_DIST_DIR=.next-review pnpm run build` para no pisar `.next`, borró la sonda acto seguido
citando P16 —bien— y dejó en `tsconfig.json` un `include` apuntando a `.next-review/**`, un directorio que ya
no existe y que el `.gitignore` tampoco cubre. Ese archivo modificado y sin stagear es lo que hacía diferir
árbol e índice. Vale anotarlo porque es la forma en que este caso se dispara en la práctica: **una sonda que
limpia su salida pero no su configuración deja el árbol sucio, y con el árbol sucio el gate del commit
siguiente no puede correr**. El defecto de este caso es independiente de eso —Turbopack rechaza el enlace
venga el delta de donde venga—, pero quien lo reproduzca conviene que sepa que el disparador más probable no
es trabajo de otra persona sino basura propia.

## Relacionados

- **151** — el otro fallo del mismo mecanismo, ése sí compensable desde el proyecto. Los dos juntos hacen
  que un commit con lockfile en un proyecto Next no pueda pasar el gate de ninguna forma limpia.
- **069**, **045**, **095** — las decisiones de `commitTree` que sí funcionan y que este caso no propone
  tocar.
- **152** — la tercera del día sobre la misma superficie: el guard que decide con un id de runner distinto
  del que escribió el plan.
- **156** — lo que salió de medir este caso, y **lo único que lo destraba**: hoy cualquier archivo sucio
  fuerza la copia, aunque el gate no lo vaya a leer. Acotarlo es un cambio del contrato que cada instancia
  recibe, no un arreglo de este caso, y por eso vive aparte.
- **094** — el caso de la familia de la opción 3, que la cita a «el 142» nombraba mal.
