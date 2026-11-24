---
caso: 529
titulo: una épica open con todas sus historias en done/ no pide cerrar
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.0
---

# 529 — una épica open con todas sus historias en done/ no pide cerrar

**🟢 resuelto en 0.124.0** · detectado en 0.123.0 · prioridad **media**: no rompe nada, pero el roadmap muestra abierta una épica
terminada, y `context` y `tree` la siguen contando entre lo que queda. Pasó en una corrida real de una instancia, y la
épica la tuvo que cerrar una persona.

## Resumen

`check` pide cerrar una épica cuando todas sus historias están en `done/`, pero sólo si su `status` es `active`. Con
`status: open` —el estado con el que nace una épica, y en el que se queda en las instancias cuyo recorrido no pasa por
`ops promote`— la misma épica, terminada, pasa en verde sin aviso. El paso 13 de Done del PROTOCOL («cerrar la épica si
no le queda ninguna historia abierta») no distingue estados; `check`, que es su respaldo, sí.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto --force) && cd "$BANCO"
# planning/roadmap/epic-001-alta-de-clientes.md: status: open, una historia rechazar-duplicado (→ C1, service: api)
# planning/done/rechazar-duplicado.md: su entrada de cierre; la cola, vacía
node tools/ops.js check planning; echo "exit=$?"
sed -i 's/^status: open/status: active/' planning/roadmap/epic-001-*.md
node tools/ops.js check planning; echo "exit=$?"
```

## Síntoma

Salida real, 0.123.1, 2026-11-21. Con `status: open`:

```
✓ planning válido: 1 épica(s), 0 tarea(s) en cola, 1 terminada(s)
exit=0
```

Con `status: active`, la misma épica:

```
✗ roadmap/epic-001-alta-de-clientes.md: active sin historias pendientes; debe cerrar
exit=1
```

## Causa raíz

`engine/planning/contracts.js:174` (0.123.1):

```js
if (epic.status === 'active' && !missing.length) errors.push(`${at}: active sin historias pendientes; debe cerrar`)
```

`open` no entra en la condición.

## Fix propuesto

Que la condición cubra todo estado no terminal —`open` y `active`—, con el mensaje nombrando el estado que tiene. Si
para `open` se prefiere no frenar, un aviso (⚠) en vez de un error.

**Decidido acá: error, igual que `active`.** Una épica `open` con todo hecho no puede estar recién propuesta, porque
sus historias ya se construyeron. Es el mismo estado incoherente que `active` sin nada pendiente. Y el costo de
actualizar es cero: en las seis instancias medidas no hay ninguna en ese estado hoy (ver «Tradeoffs»).

## Tradeoffs

- **Una instancia con épicas `open` ya terminadas pasa de verde a rojo al actualizar.** Medido el 2026-11-21 sobre seis
  instancias reales con el lector del motor (`snapshot` de `engine/planning/state.js`): 101 épicas `open`, 22 `active` y
  ninguna, en ningún estado no terminal, con todas sus historias en `done/`. Hoy el cambio no pone a ninguna en rojo.
- `/autobuild` corre `check` al cerrar (`automatization/workflows/autobuild.js:2615-2620`): con el error, una corrida que
  deja una épica `open` terminada entra al `closing-repair`, que es lo que tiene que pasar —cerrarla—, en vez de salir en
  verde.
- `ops promote` sólo promueve una épica `open` (`engine/planning/promote.js:60`). Una `open` terminada no se puede
  promover y tampoco tiene por qué: lo que corresponde es cerrarla.

## Contexto de descubrimiento

En una instancia sidecar real, la corrida 21 de su banco de release (2026-11-03) dejó una épica `open` con sus tres
tareas en `done/`. `check` dio válido sin pedir cerrarla, aunque su pedido de QA decía que lo haría en la última tarea, y
la cerró coordinación en el commit de cierre. La instancia agregó el estado `open` a su propio `check` el 2026-11-20.
Otra instancia hizo lo mismo en su script de cierre al traerse el de la primera.

## Relacionados

- 535: un WIP que apunta a una tarea hecha; otra mitad de cierre que `check` no ve.
- 463: cerrar una tarea con otro slug; también un cierre a medias que pasa en verde.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto** — se hizo como decía su forma de error: `engine/planning/contracts.js:173-177` cubre `open` y
  `active`, y el mensaje nombra el estado que tiene la épica. Distinto de lo propuesto en un punto: también exige que la
  épica tenga historias. La revisión independiente encontró que, sin eso, una épica `open` recién escrita y sin
  historias recibía, además de «falta al menos una historia», el consejo de cerrarla. Con `active` ya pasaba; el cambio
  lo extendía al borrador, que es donde más falta la historia.
- **Tradeoffs: verde a rojo al actualizar** — medido antes de cambiar nada: en seis instancias reales, ninguna épica
  `open` ni `active` tiene todas sus historias en `done/`. No pone a ninguna en rojo hoy.
- **Tradeoffs: autobuild** — `closing` corre `check` (`autobuild.js:2615-2620`). Con el error, una corrida que deja una
  épica `open` terminada entra a `closing-repair` en vez de salir en verde. Se leyó en el fuente; no se corrió un
  autobuild.
- **Tradeoffs: promote** — `ops promote` usa `validateEpic` (`promote.js:64`), no `validateState`, así que el cambio no
  lo alcanza. Lo comprobó la revisión independiente.
- **Resumen: `context` y `tree` la siguen contando** — el arreglo no toca ninguno de los dos: obliga a cerrarla, y
  cerrada dejan de contarla. Medido en el banco: con la épica `open` terminada, `tree` muestra `● epic-001 Épica 001
  [open]` y `context` dice `EPIC   001: Épica 001 — sin promover`, o sea que invita a promover algo hecho; con
  `closed`, `tree` muestra `✓ epic-001 Épica 001 [closed]` y `context` no la nombra.
- **Prioridad** — no traía condición de escalada; no hay nada que decir de ella.
- **Lo que el enunciado no preveía**: el borde de la épica sin historias, de arriba. Y que la reproducción original
  armaba el estado marcando historias a mano sobre una copia de una instancia: se reemplazó por un banco propio, con el
  incidente real en «Contexto».

Lo que se corrió:

- Línea de base (0.123.1, antes del cambio), en el banco: `open` con todo hecho → `✓ planning válido`, exit 0; `active`
  → `✗ … active sin historias pendientes; debe cerrar`, exit 1.
- Prueba nueva en `test/planning/backlog.test.js`, vista en rojo antes del arreglo (`/open sin historias pendientes;
  debe cerrar/` no coincidía; después, la de la épica sin historias) y en verde después: 11 pass.
- Mutaciones en una copia (`git ls-files -co --exclude-standard`), verde sin mutar y roja con cada una: volver a sólo
  `active`, aceptar cualquier estado salvo `template`, fijar `active` en el mensaje, quitar `epic.stories.length`. Las
  cuatro dieron `ℹ fail 1`.
- Prueba real sobre la versión final, banco nuevo (`bench suelto --force`): `open` y `active` con todo hecho → `✗ …
  <estado> sin historias pendientes; debe cerrar`, exit 1; `closed` → `✓`, exit 0; `open` con la historia pendiente →
  `✓`, exit 0; `open` sin historias → sólo «falta al menos una historia» y «C1 no está cubierto», sin «debe cerrar».
- `npm run ci` con todo stageado, después del contraste del cierre: ver punto 13.

**Sin probar:** que `/autobuild` repare de verdad la épica en `closing-repair` cuando su última tarea la deja `open`; se
leyó el camino en el fuente y no se gastó una corrida real.

### Lista de cierre

1. hecho: línea de base en el banco con la salida de antes, `open` exit 0 y `active` exit 1.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: la aserción de `open` y la de la épica sin historias se vieron en rojo y después en verde.
4. hecho: cuatro mutaciones en una copia, las cuatro rojas; la copia sin mutar, verde.
5. hecho: el cambio quita algo, y el contraste del cierre lo encontró: una épica `active` sin historias recibía «debe cerrar» y ya no. La aserción de ausencia recorre `open` y `active` sin historias, y se vio en rojo devolviendo lo quitado sólo para `active` (`AssertionError … una épica active sin historias no tiene nada que cerrar`).
6. hecho: banco real con el motor enlazado; se midió que `open` con todo hecho ya no sale en verde, además de que aparece el error.
7. no aplica: `check` no depende de un modelo, un runner ni un sistema externo.
8. hecho: «Lo que se corrió» enumera los cinco estados del banco; el camino de autobuild queda en «Sin probar». La prueba real se repitió después del último cambio.
9. no aplica: el cambio no coordina nada entre runners, raíces ni ramas.
10. hecho: el texto del mensaje sólo lo leía `test/planning/backlog.test.js`; `promote`, `registry` y `nextEpic` revisados por la revisión independiente.
11. hecho: revisión independiente en dos pasadas; la primera halló el borde de la épica sin historias, que se arregló, y la segunda, sobre lo cambiado, no halló nada. El contraste del cierre halló además la quita del punto 5 y los huecos de los puntos 13 y 14; lo que cambió después es una aserción de prueba, sin código de producción.
12. hecho: pasada de comentarios; el de la prueba repetía la razón del de `contracts.js` y se achicó a una línea.
13. hecho: `npm run ci` con todo stageado —CHANGELOG y este cierre incluidos—, después del contraste: 1853 pass, 0 fail, exit 0.
14. hecho: este `## Cierre` recorre Fix propuesto, Tradeoffs, Resumen —medido en el banco—, Prioridad y lo que el enunciado no preveía.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: estado `resuelto` en el frontmatter y en el encabezado, `resuelto-en: 0.124.0` —la versión abierta, decidida por la persona el 2026-11-21— y entrada en «Corregido» del CHANGELOG.
