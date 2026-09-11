---
caso: 106
titulo: El INBOX no tiene salida más que el borrado a mano, y descomentar su recurrencia deja check en rojo
estado: abierto
prioridad: media
version-detectada: 0.80.0
---

# 106 — Del INBOX se sale sólo a mano, y la recurrencia que lo recordaría no pasa `check`

**🔴 abierto** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **media** — nada se rompe; lo
promovido y lo resuelto se queda en el INBOX hasta que alguien se acuerde, y la única ayuda que trae el
molde falla `check` el día que se la activa

## Resumen

El molde dice cómo sale una entrada del INBOX: «El runner puede agregar; solo una persona promueve y
elimina» (`template/planning/INBOX.md`). Borrar es la salida, y está bien que la decida una persona. Lo que
falta es todo lo que la ayudaría a hacerlo:

1. **Nada recuerda recorrerlo.** La recurrencia `inbox` del molde viene dentro del bloque de ejemplos
   comentado de `RECURRING.md`, así que una instancia recién creada no la tiene.
2. **Activarla deja `check` en rojo.** Descomentada tal cual, la fila no declara `(service: <ruta>)` y
   `check` sale 1. Y como su `Desde` es una fecha fija del molde, nace vencida.
3. **Nada señala lo que ya salió.** `check` no avisa nada sobre el INBOX, ni siquiera una entrada cuyo
   nombre coincide con una tarea ya cerrada en `done/`.

Un `archive inbox` no existe (`archive` responde «Sólo se archiva `human-actions`»), pero que haga falta
depende de una decisión que el caso no puede tomar: ver «Fix propuesto».

Lo que entra al INBOX sin tope es el **101**.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable:

```bash
B=<banco>; OPS=$PWD/engine/cli/ops.js; A=$B/acme
node $OPS init $A --mode embedded --runner ninguno --no-install >/dev/null
node $OPS archive $A/planning inbox; echo "exit=$?"
node $OPS check $A/planning | tail -1; echo "check=$?"
grep -n 'inbox' $A/planning/RECURRING.md                     # dentro de <!-- … -->
cp $A/planning/RECURRING.md $B/RECURRING.orig
# Descomentar la fila inbox tal cual: moverla debajo de la cabecera de la tabla
node -e '
const fs=require("fs");const f=process.argv[1];let t=fs.readFileSync(f,"utf8");
const row=t.match(/^\| inbox .*$/m)[0];t=t.replace(row+"\n","");
t=t.replace("|---|---|---|---|\n","|---|---|---|---|\n"+row+"\n");fs.writeFileSync(f,t)' $A/planning/RECURRING.md
node $OPS check $A/planning; echo "check=$?"
cp $B/RECURRING.orig $A/planning/RECURRING.md
```

Y para ver qué pasa con los otros tres ejemplos y con un `Desde` igual al día de `init`, lo mismo con las
cuatro filas descomentadas, y con una fila inbox escrita con `Desde` de hoy y `(service: planning)`.

## Síntoma

Salida real, 2026-09-11, sobre `main` en 0.81.0 (el banco en el scratchpad de la sesión):

```
Sólo se archiva `human-actions`. La evidencia de una tarea ya vive en su propio archivo de `done/`, así que archivar una épica dejó de tener sentido.
exit=2
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
check=0
55:| inbox | trimestral | 2026-08-01 | Recorrer el INBOX entero. _Aceptación: ninguna viñeta queda sin decisión de promover, dejar o borrar._ |
⚠ RECURRING.md: inbox vencida hace 41 día(s) (2026-08-01)
✗ RECURRING.md inbox: la tarea no declara (service: <ruta>)

1 error(es), 1 advertencia(s)
check=1
```

Las cuatro filas de ejemplo descomentadas fallan igual —no es algo de la fila `inbox`—, y `ops recurring`
las da por vencidas desde el primer día:

```
DUE  deps             vencida hace 10 día(s)  (nunca corrió)
DUE  accesos          vencida hace 72 día(s)  (nunca corrió)
DUE  costos           vencida hace 10 día(s)  (nunca corrió)
DUE  inbox            vencida hace 41 día(s)  (nunca corrió)
…
✗ RECURRING.md deps: la tarea no declara (service: <ruta>)
✗ RECURRING.md accesos: la tarea no declara (service: <ruta>)
✗ RECURRING.md costos: la tarea no declara (service: <ruta>)
✗ RECURRING.md inbox: la tarea no declara (service: <ruta>)

4 error(es), 4 advertencia(s)
check=1
```

Con `Desde` igual al día de `init` y `(service: planning)`, `check` pasa pero la fila nace vencida:

```
⚠ RECURRING.md: inbox vence hoy (2026-09-11)
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
check=0
```

En la instancia donde se descubrió, el INBOX tenía ~600 líneas de entradas ya resueltas o promovidas que
nadie había sacado, sobre 3.586. El número es de la instancia y no se reproduce desde acá.

## Causa raíz

- `engine/cli/archive.js:83` — `archive` rechaza todo lo que no sea `human-actions`; `archiveHumanActions`
  (`:59`) es el único archivado, y escribe en `done/human-actions.md`, no en una carpeta de archivo.
- `engine/planning/parser.js:407-421` — `readInbox` sólo cuenta ítems por sección; su único consumidor es
  `engine/planning/state.js:17`, que lo lleva a la línea `INBOX` de `ops tree`
  (`engine/cli/planning.js:300-303`). Ni `check` ni otro aviso leen el INBOX.
- `template/planning/RECURRING.md:55` — la fila `inbox`, dentro del comentario de ejemplos, sin
  `(service: …)` y con `Desde` 2026-08-01.
- `engine/planning/recurring.js:87-88` — `validate` arma la línea de tarea y exige `service`, porque lo que
  se promueve es esa línea y `BACKLOG` la rechazaría sin él. La regla es correcta; los ejemplos no la
  cumplen.
- `engine/planning/recurring.js:119-124` — sin una vuelta cerrada, el vencimiento es el propio `Desde`:
  `Desde` es la **primera fecha de vencimiento**, no el día en que se declara la fila.

## Fix propuesto

**Decisión pendiente del usuario:** dos preguntas, cada una con su recomendación. Lo demás depende de
cómo se contesten.

**1. ¿Una entrada del INBOX tiene estado?**

- **A — No. Sale borrándola, como hoy.** Promover es copiar a `BACKLOG` o al roadmap y borrar; descartar es
  borrar. `git log -p` es el archivo. Entonces `archive inbox` sobra: no hay «resueltas» que mover,
  porque una entrada resuelta es una entrada que ya no está.
- **B — Sí, `- [x]`.** Una entrada marcada queda en el INBOX hasta que `archive inbox` la mueva. Cambia el
  contrato («solo una persona promueve y elimina» pasa a «marca»), el molde, `readInbox` —que hoy acepta
  `[x]` y lo cuenta igual que `[ ]` (`parser.js:411-412`)— y la documentación. Y agrega un paso: marcar y
  después archivar, donde hoy hay uno.

**Recomendación: A.** Es el contrato que ya existe y no le agrega un paso a la persona. Las ~600 líneas
resueltas de la instancia no piden un estado; piden que alguien pase a borrarlas, y eso lo pide la
recurrencia de la pregunta 2. Con A, el aviso de `check` que queda útil es el de una entrada cuyo nombre
coincide con una tarea en `done/` —probablemente promovida y no borrada—, **como advertencia**: el molde
no obliga a que la tarea promovida conserve el nombre del ítem, así que la coincidencia es un indicio y no
una prueba, y una advertencia es lo que ese indicio sostiene.

**2. ¿La recurrencia `inbox` viene activa?**

- **Activa en el molde**, fuera del comentario. `init` escribe `Desde` y resuelve `service`: si no, nace
  vencida o rompe `check` como arriba.
- **Sólo sugerida**: `init` imprime que existe y cómo activarla, y la fila de ejemplo se arregla para que
  descomentarla no deje `check` en rojo.

**Recomendación: activa.** No bloquea nada —una recurrencia vencida es una advertencia, no frena ninguna
tarea (`RECURRING.md`, «No bloquea»)—, así que no limita a la persona; y es la única salida del INBOX que
no depende de que alguien se acuerde. Con una corrección a lo que se dio por supuesto: **`Desde` no puede
ser la fecha de `init`**, porque es la primera fecha de vencimiento y la fila nacería «vence hoy», como
muestra el síntoma. Tiene que ser `init` más un período. Y `service` tiene que ser una ruta que `check`
acepte y que diga dónde se trabaja: `planning` pasa, y es honesto, porque recorrer el INBOX es trabajo
sobre `planning/`.

Con las dos recomendaciones:

1. La fila `inbox` sale del comentario, con `Desde` = día de `init` + 3 meses y `(service: planning)`.
   `init` la escribe; `upgrade` no la toca, porque `RECURRING.md` es del proyecto.
2. Las otras tres filas de ejemplo declaran `(service: …)`, para que descomentarlas no deje `check` en
   rojo. Es un defecto del molde más amplio que el INBOX; se arregla acá porque es la misma línea de
   comentario, no porque sea el mismo caso.
3. `check` avisa, como advertencia, una entrada del INBOX cuyo nombre en negrita es el slug de un
   `done/<slug>.md`.
4. No hay `archive inbox`. El mensaje de `archive` no cambia.

Si la pregunta 1 se contesta B, el 3 se vuelve el aviso de «hay entradas marcadas sin archivar» y el 4 se
invierte: `archive inbox` mueve las `[x]` y deja las demás intactas.

## Tradeoffs

- **La fila activa es una fecha más en cada instancia.** Quien no la quiera la borra; el molde de
  `RECURRING.md` ya dice que la salida definitiva es borrar la fila.
- **El aviso por nombre en `done/` tiene falsos positivos y falsos negativos.** Un ítem que se llama igual
  que una tarea sin ser su origen avisa, y uno promovido con otro nombre no avisa. Por eso es advertencia.
- **Con A no hay archivo del INBOX dentro de `planning/`.** Lo borrado vive en la historia de git. Para
  una instancia que quiera ver «qué se decidió del INBOX» sin git, eso es un paso más.
- **Una fila `inbox` activa en una instancia ya creada** no llega por `upgrade`: el archivo es del proyecto.
  Las que ya existen se enteran por el CHANGELOG, o no se enteran.

## Qué tiene que probar el cierre

- Una instancia recién creada tiene la fila `inbox` activa, y `check` sale 0 **sin** advertencia de
  vencimiento el día de `init`. Vista en rojo con `Desde` = día de `init`: «vence hoy».
- Descomentar cada una de las filas de ejemplo que queden deja `check` en 0.
- `check` advierte una entrada del INBOX cuyo nombre es el slug de un `done/<slug>.md`, sale 0, y no dice
  nada sobre una que no coincide: vista en rojo sin el aviso.
- La decisión 1 queda escrita en el cierre. Si fue B, `archive inbox` saca las `[x]` y deja las demás
  intactas, línea por línea.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11, reportado dentro del 101. La instancia activó por su cuenta
una recurrencia mensual del INBOX y agregó a su validador el aviso de entradas que nombran tareas cerradas.

Se separó del 101 al mejorarlo, el 2026-09-11 sobre 0.81.0. Al activar la recurrencia en el banco apareció
que descomentar el ejemplo deja `check` en rojo —el caso original pedía activarla sin haberlo probado—, que
las otras tres filas fallan igual, y que `Desde` es la primera fecha de vencimiento, así que «Desde = fecha
de `init`» también nacía vencida.

## Relacionados

- **101** — la otra mitad: lo que entra. Sin el tope de allá, la recurrencia de acá recorre cada trimestre
  un INBOX más largo.
- **062** — la recurrencia vencida no la promueve el runner: el vencimiento avisa, y promover sigue siendo
  de una persona. Es lo que hace que activar la fila no limite a nadie.
