---
caso: 367
titulo: un renombrado por parche se juzga sólo como una escritura en el destino
estado: resuelto
resuelto-en: 0.106.1
prioridad: media
version-detectada: 0.106.0
---

# 367 — Un `apply_patch` que renombra con `*** Move to:` se juzga como una escritura en el destino y nada más: no se lee el contenido que el archivo ya traía, ni se cuenta que el nombre viejo desaparece

**🟢 resuelto en 0.106.1** · detectado en 0.106.0 · prioridad **media**.

**Prioridad media**: son dos huecos de guards que ya existen, alcanzables sólo con Codex, que es quien
renombra por parche. Ninguno es una regresión: los dos pasaban igual antes del 366.

## Resumen

El caso 366 hizo que el destino de un renombrado sea una ruta más que los guards de archivos miran. Con eso
se frena mudar un archivo afuera de las raíces o a un nombre como `.env`. Lo que quedó sin mirar es lo que
un renombrado tiene de distinto de un archivo nuevo: llega **con contenido** que el parche no trae, y deja
**sin su nombre** al archivo de origen.

1. **El contenido que ya estaba en disco no se juzga.** De un archivo modificado, el guard de migraciones
   mira lo que el parche agrega. En un renombrado, lo que pasa a ser la migración es el archivo entero.
2. **El nombre viejo desaparece y nadie lo cuenta.** Renombrar una prueba a un nombre que no es de prueba
   la saca de la suite igual que borrarla, y `test-evidence` sólo frena el borrado.

## Reproducción

Con una instancia cuya raíz es `service`, un `service/scratch/drop.sql` que contiene `DROP TABLE users;` y
una prueba `service/src/a.test.js` commiteada:

```
*** Begin Patch
*** Update File: service/scratch/drop.sql
*** Move to: service/db/migrations/003_drop.sql
@@
 DROP TABLE users;
+-- listo
*** End Patch
```

```
*** Begin Patch
*** Update File: service/src/a.test.js
*** Move to: service/attic/a.js.txt
@@
-x
+y
*** End Patch
```

## Síntoma

Preguntándole a cada guard con el pedido de Codex, el 2026-10-10:

```
FRENA   migrations      Add File de una migración con DROP
pasa    migrations      Move to: un archivo con DROP en disco pasa a ser migración
FRENA   test-evidence   Delete File de una prueba
pasa    test-evidence   Move to: la prueba pasa a llamarse a.js.txt
```

## Causa raíz

- `engine/hooks/migrations.js` — para una sección de parche juzga `judgedPatch`, que de una modificación
  toma lo agregado. Para el destino de un renombrado no lee el archivo de origen.
- `engine/hooks/files.js`, `test-evidence` — mira las secciones `*** Delete File:`. Un `*** Move to:` no es
  una, y el archivo de origen deja de existir con ese nombre.

## Fix propuesto

1. Que el guard de migraciones, para un destino renombrado que es una migración y cuyo origen no lo era,
   juzgue lo que va a quedar: el archivo de origen como está en disco, menos lo que el parche quita, más lo
   que agrega.
2. Que `test-evidence` trate el origen de un renombrado como un borrado cuando el nombre nuevo deja de ser
   una prueba del proyecto.
3. Mirar si a algún otro guard de archivos le pasa lo mismo: `generated`, `secrets`, `engine`, `ops-config`.

## Valor

Cierra lo que el 366 dejó dicho de más: su entrada afirma que el destino de un renombrado se juzga, y se
juzga su ruta, no su contenido.

## Qué podría salir mal

1. **Frenar un renombrado legítimo de una migración** que trae un `DROP` y cuyo parche lo quita. Por eso el
   fix resta lo quitado en vez de leer el archivo tal cual.
2. **Frenar la mudanza de una prueba a otra carpeta.** Sólo cuenta como borrado si el nombre nuevo ya no es
   una prueba; moverla y que siga siéndolo no pierde nada.
3. **Leer del disco un archivo que el mismo parche crea más arriba.** El orden dentro del sobre importa y
   hoy ningún guard lo sigue.

## Cierre

**Resuelto en 0.106.1.**

### Cómo quedó, al final

Este cierre cuenta seis vueltas, y las del medio describen cosas que ya no están. Lo que hay hoy son dos
reglas, las dos de una línea:

- **Migraciones.** Un archivo que un parche renombra hacia una ruta de migración se juzga, además de por lo
  que el parche le agrega, **por lo que trae en disco, entero**. Entero incluye su reversión: el mismo parche
  puede sacarle o correrle el marcador, y lo que era reversión pasa a aplicarse. El mensaje dice de dónde
  viene: «… llega desde <origen>, que trae …».
- **Pruebas.** Renombrar una prueba cuenta como borrarla cuando el nombre nuevo **no es una prueba para este
  guard**, y sólo entonces. Qué es una prueba lo decide la misma función que ya decidía para el borrado.

Lo que no se hace, y por qué:

- **No se calcula cómo va a quedar el archivo después del parche.** Se intentó, imitando a quien lo aplica, y
  cuatro revisiones seguidas encontraron otra regla que faltaba —dónde cae cada hunk, sus anclas, el fin de
  archivo, cuán laxa es la coincidencia, qué parches rechaza—; la última versión explotaba con un parche
  grande. **El costo se elige**: un archivo que trae algo destructivo frena también cuando el parche se lo
  quita, y cuando estaba en su reversión. La salida es la aprobación que ese guard ya ofrece.
- **No se afina qué es una prueba sólo para el renombrado.** Se intentó —otras extensiones, nombres que no
  corren, lo que lo es sólo por su carpeta— y cada regla frenó algo legítimo o dejó pasar otra cosa: pasar
  `__tests__/Button.js` a `.tsx`, mover `a.test.js` a `__tests__/a.js`, darle extensión a un `README`. Lo
  que esa función no conoce —`.mjs`, `.cy.ts`, un `.bak` dentro de una carpeta de pruebas— no lo conoce
  tampoco para el borrado, y se arregla ahí, para los dos.

### El recorrido de lo que este caso enumeró

- **Fix 1, juzgar lo que va a quedar en la migración — se hizo, y más ancho que lo propuesto.** El caso
  pedía hacerlo sólo cuando el origen no era una migración. La condición no se podía ver caer: renombrar una
  migración que ya existe lo frena antes la regla de no reescribirlas, por el origen. Se juzga siempre que
  haya archivo de origen que leer: el archivo con el parche aplicado. La primera versión lo calculaba
  restando y sumando líneas sueltas, y estaba mal: está en la revisión, más abajo.
- **Fix 2, el origen de una prueba renombrada — se hizo.** Cuenta como borrarla sólo si el nombre nuevo deja
  de ser una prueba.
- **Fix 3, mirar los otros guards de archivos — se miró, y no les pasa.** Con un renombrado en los dos
  sentidos, desde un archivo cuidado y hacia uno:

  ```
  FRENA  generated    x.generated.js → x.js          FRENA  generated    x.js → x.generated.js
  FRENA  secrets      .env → notas.txt               FRENA  secrets      notas.txt → .env
  FRENA  engine       <motor>/a.js → service/a.js    FRENA  engine       service/a.js → <motor>/a.js
  FRENA  ops-config   ops.config.json → viejo.json   FRENA  ops-config   nuevo.json → ops.config.json
  ```

  Deciden por la ruta, y las dos rutas ya estaban a la vista: la de origen por su `*** Update File:` y la
  de destino desde el 366. Los dos de este caso son los que miran otra cosa: el contenido, y que un nombre
  desaparezca.
- **Qué podría salir mal 1, la migración con un `DROP` que el parche quita — se frena, y se eligió así.**
  Durante tres vueltas no se frenó, calculando qué quitaba el parche; por qué se dejó de calcular está arriba.
- **2, mudar una prueba a otra carpeta — no se frena** si sigue siendo una prueba, y está probado.
- **3, el archivo que el mismo parche crea más arriba — queda como estaba.** Sin archivo en disco que leer
  se juzga lo que el parche trae para esa sección, igual que antes de este caso. El orden dentro del sobre
  sigue sin seguirse.

### Qué se corrió

- **Los dos parches de la reproducción**, después del cambio:

  ```
  FRENA   migrations      Move to: un archivo con DROP en disco pasa a ser migración
  FRENA   test-evidence   Move to: la prueba pasa a llamarse a.js.txt
  ```

- Rojo previo: las dos pruebas nuevas de `test/hooks/patch-move.test.js`, antes del cambio.
- Ocho mutaciones en rojo, en una copia fuera del árbol: no leer el origen, no restar lo quitado, no sumar lo
  agregado, tratar un origen que no está como destructivo, no mirar los renombrados de pruebas, frenar toda
  mudanza de una prueba, frenar la de cualquier archivo, y perder de dónde viene el renombrado. La de no
  sumar lo agregado sobrevivió la primera vez y se llevó su caso de prueba.
- La tabla de los otros guards, de arriba.

Como el 366, se midió con el sobre que manda Codex y no con una sesión suya: la cuenta de esta máquina sigue
sin cupo.

### Lo que encontró la revisión independiente (2026-10-10)

Cinco cosas de este caso, todas reproducidas, y las cinco se arreglaron.

- **«Lo que va a quedar» se calculaba por aproximación, y erraba en los dos sentidos.** Lo agregado se pegaba
  al final del archivo: en una migración con marcador de reversión, un `DROP` agregado al bloque que aplica
  quedaba leído como reversión y pasaba. Y lo quitado era la primera línea que se le parecía: sacar el
  `DROP` de la reversión sacaba del texto juzgado el del bloque que aplica. Ahora cada hunk se aplica donde
  cae —su contexto y lo que quita, como una sola corrida de líneas—. Si alguno no se puede ubicar, se juzga
  el archivo como está: no se supone que el parche quitó algo. Y lo que el parche agrega se sigue juzgando
  además por su cuenta, como antes de este caso.
- **Un archivo de origen con finales de línea de Windows** no coincidía con lo que el parche quitaba, y se
  frenaba un renombrado que sacaba lo destructivo.
- **Un sobre con finales de línea de Windows no se leía**: ninguna cabecera se reconocía, y las dos defensas
  de este caso no corrían. Era anterior —el lector de secciones nació así en el 199—; no se comprobó si Codex
  manda sobres así.
- **Cambiar la extensión de una prueba se frenaba como borrarla**: `a.test.js` a `a.test.mjs`, `a.spec.ts`
  a `a.spec.mts`, o a `cypress/e2e/a.cy.ts`. El nombre nuevo seguía siendo de prueba y el guard no lo
  contaba entre los que cuida. Para el renombrado alcanza con que lo siga pareciendo.
- **Lo que queda, y se dice**: sacar un archivo de una carpeta `tests/` hacia otra que no lo es se frena
  aunque sea un ayudante y no una prueba. El guard no tiene cómo distinguirlos por el nombre, y ahí la
  salida es la aprobación que ese guard ya ofrece.

Rojo previo de las cuatro, y quince mutaciones más en rojo. Cuatro sobrevivieron la primera vez: dos se
llevaron su caso de prueba —dónde cae un marcador de reversión agregado, y que lo que otra sección agrega
sigue contando cuando el archivo renombrado existe— y a las otras dos se les quitó el código, dándolo por
sobrante. **Eso estuvo mal**, y lo encontró la revisión siguiente.

### Lo que encontró la segunda revisión (2026-10-10)

Cuatro cosas de este caso, y tres eran regresiones respecto de la versión anterior de este mismo arreglo.

- **Un hunk que sólo agrega se ponía en la primera línea del archivo.** Un marcador de reversión agregado
  así volvía reversión todo lo que el archivo traía, y un `DROP` que ya estaba pasaba. Era una de las dos
  piezas quitadas por «sobrante». Un hunk que no dice dónde va no se ubica: se juzga el archivo como está.
- **Cada hunk se buscaba desde la primera línea.** Con una línea repetida, el segundo hunk caía sobre la
  primera aparición. Era la otra pieza quitada. Ahora cada uno se busca desde donde terminó el anterior.
- **El ancla de un hunk se descartaba.** El texto que va después de `@@` dice desde qué línea se busca, y
  sin leerlo quitar el `DROP` de la reversión seguía tapando el del bloque que aplica, que es lo que la
  corrección anterior decía haber arreglado. Lo había arreglado para el marcador escrito como contexto y no
  como ancla.
- **`a.test.bak`, `a.spec.disabled` y `a.test.off` contaban como «sigue siendo una prueba».** La regla que
  dejaba pasar un cambio de extensión aceptaba cualquiera, y ésas son justo la forma de apagar una prueba.
  Ahora tiene que ser una extensión que corra.

Lo que la revisión comprobó y no dio defecto: los parches de migraciones **sin** renombrado dan el mismo
veredicto que antes de este caso —el lector de secciones cambió para todos, y era lo que más había que
mirar—; y con finales de línea de Windows, los cuatro veredictos que cambian pasan a ser los del mismo
parche con finales de Unix.

Y una tercera revisión encontró tres cosas más de este caso, las tres sobre dónde cae un hunk, y ahí dejó
de adivinarse. `movedText` ubica ahora cada hunk como lo ubica quien aplica el parche. **Documentado**:
leído el 2026-10-10 en la rama principal de `openai/codex`, `compute_replacements` en
`codex-rs/apply-patch/src/file_update.rs` y `seek_sequence.rs`; no se comprobó que la versión instalada,
0.152.1, coincida. De ahí salen las cuatro reglas: cada ancla se busca desde donde se está y deja en la línea
siguiente; lo que el hunk quita y su contexto se buscan desde ahí, y con `*** End of File` desde el final
sin volver atrás del hunk anterior; un hunk que sólo agrega va al final del archivo; y una línea coincide
igual, o sin sus espacios del final, o sin los de los dos lados. Lo que cambió con eso:

- **`*** End of File` se ignoraba**: el hunk caía en la primera coincidencia y no en la última.
- **Dos anclas seguidas**: la primera se perdía.
- **Un hunk que sólo agrega** se dejaba sin ubicar; va al final, que es donde va.
- **Una prueba renombrada a `.bak` dentro de una carpeta de pruebas** seguía pasando, porque la carpeta
  alcanzaba para darla por prueba. Tiene que conservar su extensión o pasar a otra de las que corren.

Veinte mutaciones en rojo sobre esta versión. Tres sobrevivieron la primera vez y las tres se llevaron su
caso de prueba.

### La cuarta revisión, y el fin de la imitación (2026-10-10)

Ocho hallazgos más, cuatro de ellos de este caso: el parche que Codex aplica reintentando sin su línea vacía
final quedaba sin ubicar; un hunk de 150.000 líneas agregadas hacía explotar el guard; con un archivo
sangrado y miles de anclas tardaba dos segundos; y el comentario atribuía a la fuente de Codex una regla
—varias anclas seguidas— que esa fuente rechaza. Y uno de la regla de las pruebas: pasar
`__tests__/Button.js` a `.tsx` se frenaba como borrarla.

Ninguno se arregló en su lugar. Se sacó lo que los producía, que es lo que dice «Cómo quedó, al final».
Dieciséis mutaciones en rojo sobre esa versión; la única que sobrevivió se llevó su caso de prueba.

### La quinta revisión (2026-10-10)

Ocho hallazgos más, cinco de este caso, y otra vez en los dos sentidos: mover una prueba a `__tests__/` con
un nombre liso se frenaba; un `.bak` de una prueba que lo era por su carpeta pasaba; darle extensión a un
`README` de una carpeta de pruebas se frenaba; un parche que le sacaba el marcador de reversión al archivo
renombrado pasaba, y el `DROP` quedaba aplicándose; y el mensaje decía que el destino «contiene» algo que
el parche le quitaba.

Con eso las dos reglas quedaron como dice «Cómo quedó, al final»: sin nada propio. Diez mutaciones en rojo
sobre esa versión; una sobrevivió y se llevó su caso de prueba, y otra era una condición que, razonada, no
cambia ningún resultado y se quitó.

Lo que deja como lección, porque es de método y no de este código: una mutación que sobrevive dice que
falta una prueba o que la rama no se puede observar, y antes de quitar el código hay que demostrar lo
segundo. Acá no se demostró, se supuso, y las dos piezas quitadas hacían falta. Esta vez las tres
mutaciones que sobrevivieron se llevaron su caso de prueba, y ninguna se resolvió quitando código salvo una
condición que, razonada, hacía peor el resultado.

## Contexto de descubrimiento

La revisión del conjunto de la versión 0.106.1, mirando el arreglo del 366. Se reprodujo antes de escribirlo.

## Relacionados

- [366](./366-un-parche-que-renombra-un-archivo-lo-saca-de-las-raices-sin-que-lo-vea-ningun-guard.md) — de donde
  sale: hizo que el destino se mire como ruta.
- [199](./199-un-apply-patch-de-codex-no-parte-la-migracion-por-sus-marcadores.md) — por qué una migración
  de un parche se juzga por su sección.
- [365](./365-el-guard-de-shell-no-ve-un-borrado-fuera-de-las-raices.md) — el mismo par por shell: un `mv`
  desde afuera borra de afuera, y ahí se decidió no frenarlo.
