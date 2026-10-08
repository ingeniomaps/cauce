---
caso: 335
titulo: check deja pasar cuatro cosas que el protocolo dice validar
estado: resuelto
resuelto-en: 0.105.0
prioridad: media
version-detectada: 0.104.1
---

# 335 — `check` deja pasar cuatro cosas que el protocolo y el README dicen que valida

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **media**.

**Prioridad media**: ninguna rompe una corrida por sí sola, pero las cinco son promesas escritas —«valida
contratos, unicidad, trazabilidad y estados»— que la puerta no cumple, y cada una deja un estado que se lee
coherente y no lo es. Van juntas porque comparten la forma: una validación que existe para una superficie
y falta para la vecina.

Una quinta —cadencia `semanal` en `RECURRING.md`— se reportó y era un error de fixture: la fila estaba
fuera de `## Recurrencias`. Bajo la sección correcta `check` falla con «cadencia "semanal" fuera de mensual |
trimestral | semestral | anual». Queda dicho para que nadie la vuelva a buscar.

## Resumen

Sobre una instancia válida, `check` sigue en verde con:

1. El mismo slug dos veces en la cola, en el mismo hito o en dos hitos.
2. Una tarea que cita `(→ C9)` cuando la épica termina en C3.
3. Una tarea con `(service: apps/nada)` que no existe en ninguna raíz.
4. Una entrada de DONE con `tests:` todo n/a escrito en las formas documentadas `C1 → n/a — razón` o
   `A → n/a — razón`, con un `commit:` que toca `.js`. La regla sólo reconoce `n/a — razón` pelado.

## Reproducción

Sobre una instancia con la épica 001 y el hito `pedidos-v1` de tres tareas:

```bash
cd ops
echo "- [ ] **crear-pedido** [full] — dup. (→ C1) (epic: 001) (service: apps/api)" >> planning/backlog/pedidos-v1.md
node tools/ops.js check planning            # 1
sed -i 's/(→ C1) (epic: 001)/(→ C9) (epic: 001)/' planning/backlog/pedidos-v1.md
node tools/ops.js check planning            # 2
sed -i 's/(service: apps\/api)/(service: apps\/nada)/' planning/backlog/pedidos-v1.md
node tools/ops.js check planning            # 3
sed -i 's/^  tests: .*/  tests: C1 → n\/a — sin superficie/' planning/done/limpiar-logs.md
node tools/ops.js check planning            # 4, con commit: <sha> que toca apps/api/index.js
```

## Síntoma

Los cuatro:

```
✓ planning válido: 1 épica(s), 4 tarea(s) en cola, 1 terminada(s)      # 1: cuenta cuatro, no se queja
✓ planning válido: 1 épica(s), 3 tarea(s) en cola, 1 terminada(s)      # 2, 3, 4
```

Para el punto 4, llamando a la regla con el mismo commit y cuatro formas:

```
"A → n/a — sin superficie"               → errores: 0
"C1 → n/a — sin superficie"              → errores: 0
"n/a — sin superficie"                   → errores: 1
"C1 → n/a — x; C2 → n/a — y"             → errores: 0
```

## Causa raíz

- `engine/planning/contracts.js`, bloque de BACKLOG (desde la línea ~376): valida cast contra el catálogo,
  aceptación o criterio heredado, placeholders, que la historia exista en la épica y que no esté en DONE.
  No valida que el criterio citado exista en esa épica —la comprobación `cita ${criterion}, que no existe`
  está sólo para las historias dentro de la épica, línea ~350—, ni que `service` resuelva contra las raíces,
  ni que el slug sea único entre hitos: `duplicates` se aplica a criterios e historias de la épica y a DONE,
  no a la cola.
- `surfaceWithoutTests`, línea ~224: `traces.every((one) => NOT_APPLICABLE.test(one))` con
  `NOT_APPLICABLE = /^n\/a\s*[—-]/i` sobre cada traza entera; `C1 → n/a — razón` empieza por `C1`, no por
  `n/a`, y la regla se salta la entrada.

## Fix propuesto

Tres ahora, en `contracts.js`; el tercero del resumen se deja para después, abajo se dice por qué:

1. `duplicates` sobre todos los slugs de la cola, con el error `BACKLOG <slug>: repetido en <hito> y <hito>`.
2. Para cada `(→ CN)` de una tarea con `(epic: NNN)`, exigir que `CN` exista en esa épica, con el mismo
   mensaje que ya usan las historias.
3. En `surfaceWithoutTests`, quitar el prefijo `CN → ` / `A → ` antes de probar `NOT_APPLICABLE`, para
   que las formas que PROTOCOL documenta cuenten.

## Lo que se deja para después, y por qué

- **`service:` inexistente.** Validarlo puede poner en rojo instancias reales según cómo escriban `service:`
  —`.`, un nombre de raíz, una ruta relativa—, y hoy no cuesta nada: una tarea con servicio inexistente la
  ve `worktree` al resolver la carpeta. Se hace cuando se defina una sola resolución de `service` para
  `check`, `worktree` e integraciones.

## Tradeoffs

- El punto 3 va a ponerse en rojo en entradas ya cerradas con esa forma desde el 2026-09-24. La regla
  nació con fecha de corte para no juzgar lo anterior; conviene medir cuántas entradas existentes quedan
  en rojo antes de cambiar la detección, y si son muchas, mover la fecha de corte a la versión del arreglo.
- El punto 1 es el único que puede chocar con un flujo legítimo: una tarea partida que conserva el slug
  en dos hitos mientras se migra. R25 dice que eso ya es un error.

## Por qué hacerlo

El README dice «valida contratos, unicidad, trazabilidad y estados» y el PROTOCOL dice que el `tests:`
todo n/a es error desde el 2026-09-24. Lo que la puerta promete y no mide enseña a no creerle al resto, que
es el argumento que AGENTS.md usa para `issues.test.js`.

## Riesgos y regresiones

1. **Instancias reales en rojo** tras el upgrade por el punto 3. Es lo que avisa el CHANGELOG cuando
   `check` endurece; conviene correr `check` sobre las instancias conocidas antes de publicar.

## Contexto de descubrimiento

Campaña del 2026-10-08, batería de veintiséis casos negativos de `check` sobre un clon de la instancia de
prueba; veintidós dieron el error esperado y estos cuatro no; un quinto resultó ser un fixture mal puesto. El punto 4 se aisló llamando a
`surfaceWithoutTests` con `commitFiles` del mismo repositorio, que devolvía `apps/api/index.js`.

## Relacionados

- 336, `claim` que tampoco mira lo que `context` sí mira: la misma forma de hueco, en un comando.

## Cierre

Recorrido contra el caso entero:

- **Slug duplicado en la cola** — hecho en `validateState`: se cuenta en qué hitos aparece cada slug y el
  error los nombra, también cuando son el mismo hito dos veces.
- **Criterio citado inexistente** — hecho, un piso abajo de la comprobación que ya tenían las historias, y
  sólo cuando la tarea existe en su épica, para no apilar dos errores sobre la misma línea.
- **Servicio inexistente** — se deja para después, como el caso ya decía, y la prueba nueva lo repite: hasta
  que `check`, `worktree` e integraciones resuelvan `service` de una sola forma.
- **`tests:` todo n/a en las formas documentadas** — hecho en `surfaceWithoutTests`: se quita el prefijo
  `CN → ` o `A → ` antes de juzgar cada traza.
- **Tradeoff «medir cuántas entradas cerradas quedan en rojo antes de cambiar la detección»** — no se pudo
  medir desde acá: el toolkit no tiene `planning/` propio y las instancias reales no están en esta máquina.
  Se decidió no mover la fecha de corte y decirlo en el CHANGELOG, con la salida que ya existe para el `n/a`
  pelado: rastrear la prueba o `ops adopt`. Si una instancia aparece en rojo al actualizar, ése es el dato
  que faltó, y la fecha se mueve en la versión siguiente.
- **Tradeoff «tarea partida que conserva el slug en dos hitos»** — es lo que R25 llama error, y ahora
  `check` lo dice.

Cómo se supo que funciona:

- Rojo previo: las dos pruebas nuevas, en `test/planning/backlog.test.js` y `test/planning/evidence.test.js`,
  fallaron antes del arreglo y pasan después; `test/planning` y `test/instance` en 353 de 353.
- Mutaciones, una por regla: anular el duplicado, anular la cita de criterio y volver a juzgar la traza sin
  quitar el prefijo ponen cada una su prueba en rojo; restauradas, todo en verde.
- Corrida real sobre el clon de la instancia de la campaña con el motor del fuente, los mismos tres
  fixtures que en la campaña pasaron en verde: «BACKLOG crear-pedido: repetida en la cola (pedidos-v1,
  pedidos-v1)», «BACKLOG crear-pedido: cita C9, que no existe en epic-001» y «done/limpiar-logs.md
  limpiar-logs: tests: n/a dice que no hay superficie ejecutable y el commit 91f4ae2 toca apps/api/index.js»,
  los tres con exit 1; y la instancia sin tocar sigue en verde.

