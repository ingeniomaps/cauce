---
caso: 019
titulo: Los campos de una entrada de DONE se leen de una sola línea física, y el mensaje culpa a otra cosa
estado: abierto
prioridad: alta
version-detectada: 0.60.1
---

# 019 — Un campo de DONE que se envuelve pierde la mitad de su valor

**🔴 abierto** · detectado en 0.60.1 · prioridad **alta** — rechaza entradas correctas y el error señala el lugar equivocado

## Resumen

`readDone` extrae cada campo de una entrada —`acept:`, `done:`, `qa:`, `tests:`, `decisions:`,
`commit:`— con un regex de **una línea**. Todo lo que siga en las líneas de continuación no existe para
el motor.

Los valores reales se envuelven: son prosa, y el propio repositorio pide líneas de 120 columnas. Cuando
la envoltura parte una cita `[fuente: …]`, `check` responde *«decisions debe citar»* sobre un campo que
**sí** cita. El mensaje describe una ausencia que no es la que hay: no falta la cita, falta que cierre
en la primera línea, y eso no lo dice nadie.

## Reproducción

```bash
mkdir repro && cd repro
cp -r "$(npm root -g)/@ingeniomaps/cauce/template/planning" planning   # o el template de una instancia

cat >> planning/DONE.md <<'EOF'

## Hito ejemplo — Un hito cualquiera

- [x] **tarea-ejemplo** — Resultado construido.
  acept: criterio observable
  done: lo que se hizo
  qa: lo que se observó por el camino real
  tests: A → make test
  decisions: se eligió A y no B porque el borde que C describe lo exige [fuente:
  planning/adr/001-decision.md]
  commit: abc1234 feat(x): subject
EOF

node <ruta>/engine/cli/ops.js check planning
```

Control positivo: mover la cita entera a la primera línea —`decisions: se eligió A y no B [fuente:
planning/adr/001-decision.md] porque el borde que C describe lo exige`— y repetir. El error desaparece
sin que el contenido haya cambiado.

## Síntoma

```
✗ DONE.md tarea-ejemplo: decisions debe citar [fuente: ...] o [supuesto: ...]
```

La entrada cita `[fuente: planning/adr/001-decision.md]`. Está tres palabras más abajo.

## Causa raíz

`engine/planning/parser.js:218`:

```js
const field = (name) => ((body.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'mi')) || [])[1] || '').trim()
```

`.` no cruza el salto de línea y no hay flag `s`, así que el valor termina donde termina la línea. El
cuerpo de la entrada sí se captura entero —`donePattern`, línea 214, usa `[\s\S]*?`—; lo que se recorta
es cada campo dentro de ese cuerpo.

De ahí cuelgan los contratos de `engine/planning/contracts.js:46-64`, que juzgan un valor que ya viene
truncado: `validDecisionTrace`, `validTestTrace` y `validCommitTrace`.

El mismo recorte afecta a la línea de una tarea del BACKLOG (`readBacklog`, línea 186: `const rest =
task[3]`), sólo que ahí el contrato es explícito —el molde muestra la tarea en una línea— y el error
*sí* nombra la forma esperada. En DONE nada anuncia que el valor sea de una línea: el molde del propio
`DONE.md` muestra los campos cortos, y con campos cortos el defecto no aparece.

## Fix propuesto

Acumular las líneas de continuación: el campo vale hasta el próximo campo, hasta una línea en blanco o
hasta el fin de la entrada.

```diff
-      const field = (name) => ((body.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'mi')) || [])[1] || '').trim()
+      // Un campo vale hasta el próximo campo: su valor es prosa y se envuelve a 120 columnas como
+      // cualquier otra. Leer sólo la primera línea deja afuera lo que el autor escribió y hace que
+      // `check` reporte una ausencia que no existe.
+      // El corte no puede escribirse con `$`: el regex lleva flag `m`, así que `$` matchea fin de
+      // línea y el cuantificador perezoso vuelve a cortar en el primer salto. Se cierra con
+      // `(?![\s\S])`, que es lo que `donePattern` ya usa cuatro líneas más arriba.
+      const FIELDS = 'acept|done|qa|tests|decisions|commit'
+      const field = (name) => {
+        const re = new RegExp(`^[^\\S\\n]+${name}:[^\\S\\n]*([\\s\\S]*?)`
+          + `(?=\\n[^\\S\\n]+(?:${FIELDS}):|\\n[^\\S\\n]*\\n|(?![\\s\\S]))`, 'mi')
+        return ((body.match(re) || [])[1] || '').replace(/\s+/g, ' ').trim()
+      }
```

Tres detalles que no son estilo:

- **`[^\S\n]` y no `\s` para la sangría.** `\s` incluye el salto de línea, así que `^\s+` puede empezar
  a matchear en la línea anterior y arrastrar una línea en blanco adentro del valor.
- **El corte por línea en blanco** es lo que impide que el último campo de la entrada absorba lo que
  venga después. Un valor envuelto no tiene líneas en blanco adentro, así que no cuesta nada.
- **`(?![\s\S])` y no `$`.** Es el error que hace que la corrección parezca no funcionar; está
  explicado en el comentario porque el próximo que toque esto lo va a volver a escribir con `$`.

Verificado en una copia del motor sobre la reproducción de arriba: con el regex de hoy `check` devuelve
`decisions debe citar…`; con la variante que termina en `|$` devuelve **exactamente el mismo error**,
porque el flag `m` la deja idéntica al original; con la de arriba el error desaparece y
`readDone` entrega `decisions` = `"se eligió A y no B porque el borde que C describe lo exige [fuente:
planning/adr/001-decision.md]"`.

Si se prefiere no cambiar la lectura, la alternativa mínima es que el mensaje diga dónde mirar: *«la
cita tiene que cerrar en la primera línea del campo»*. Arregla el desconcierto, no el recorte: `tests:`
y `commit:` seguirían perdiendo entradas que el autor escribió.

## Tradeoffs

Acumular cambia lo que ven los contratos, y algunos podrían empezar a aceptar lo que hoy rechazan —una
cita que quedó dos líneas abajo pasa a valer, que es justamente el punto—. Ninguno se vuelve más
permisivo de lo que su prosa promete: `validTestTrace` sigue exigiendo `A → …` o `n/a — razón` en cada
tramo, y ahora los ve todos.

El `\s+` → `' '` normaliza la envoltura para que el valor se lea como una frase. Un valor que dependiera
de sus saltos de línea —hoy ninguno— se aplanaría.

**El último campo de la entrada no tiene un campo que lo cierre.** Sin el corte por línea en blanco se
come todo lo que venga después dentro del cuerpo, y lo hace en silencio: medido sobre una entrada con
una nota suelta debajo, `commit` quedó en `"abc1234 feat(x): subject Nota suelta que alguien dejó
debajo de la entrada."` y `validCommitTrace` **no se quejó**, porque el prefijo seguía siendo válido. Un
valor contaminado que ningún contrato rechaza es peor que el recorte de hoy; por eso el corte por línea
en blanco no es opcional.

Hay que mirar si algún contrato cuenta caracteres del valor: con el recorte de hoy medían un pedazo.

**No hay prueba que cubra un campo envuelto.** `test/planning/evidence.test.js` construye las entradas
como objetos y nunca pasa por el parser; `test/planning/archive.test.js` escribe un `DONE.md` real pero
con campos de una línea. O sea que la suite queda verde con el defecto adentro y va a quedar verde
después del arreglo: el fix necesita su propio caso, y el rojo previo se ve corriendo la reproducción de
arriba.

## Contexto de descubrimiento

Migrando `gouduet` de su sistema propio a Cauce (2026-09-03 a 09-05). Se tropezó **cuatro veces**
escribiendo entradas de DONE legítimas, en tareas distintas y con días de diferencia; las cuatro veces
el diagnóstico fue el mismo y las cuatro costó volver a encontrarlo, porque el mensaje manda a revisar
si la cita está y la cita estaba.

No es un borde raro: aparece en cuanto un campo pasa de 120 caracteres, que es lo normal en `done:` y
`decisions:` de una tarea real. Las 94 entradas históricas de ese proyecto tienen campos de varios
párrafos.

## Relacionados

- [021](021-no-hay-forma-de-adoptar-una-historia-anterior.md) — el otro caso de la misma migración
  sobre entradas de DONE. No comparten causa: acá el defecto es de lectura, allá falta una pieza al
  lado de la validación.
