---
caso: 056
titulo: Un directorio de planning que no existe se reporta como cola vacía, y el autobuild promueve una épica sola
estado: resuelto
resuelto-en: 0.71.0
prioridad: alta
version-detectada: 0.70.0
---

# 056 — `context` no distingue «no hay tareas» de «no encontré el planning», y `autobuild` promueve sobre esa confusión

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **alta** — escribe en `BACKLOG.md` trabajo que ninguna persona aprobó, que es exactamente lo que BR-OPS-002 prohíbe

## Resumen

`ops context <planning-dir>` sobre un directorio **que no existe** devuelve el mismo JSON que sobre una
cola vacía, y sale con **código 0**:

```json
{"blocked":"","task":null,"criteria":[],"epic":null,"wip":null,
 "queued":0,"blockedTasks":[],"humanActions":[],"claimed":false,...}
```

No hay campo que diga que la ruta no se pudo leer. Para quien consume esa salida —una persona o un
workflow— «el planning no está» y «terminaste todo» son indistinguibles.

Eso ya sería malo solo. Lo que lo vuelve alta prioridad es el consumidor: la fase **Pick** de
`autobuild` trata la cola vacía como la señal para **expandir la próxima épica al BACKLOG**. Así que un
error de ruta no produce un fallo: produce una **promoción autónoma**.

## Reproducción

En una instancia `sidecar` cuya raíz de ops es `<empresa>-ops/`, parada dentro de esa raíz:

```
$ node tools/ops.js context <empresa>-ops/planning --json
{"task":null,"queued":0,...}
$ echo $?
0
```

La ruta resuelve a `<empresa>-ops/<empresa>-ops/planning`, que no existe. Con la ruta correcta
—`planning`— el mismo comando devuelve `queued: 5` y la tarea que toca.

Es un error fácil de cometer justo en sidecar, porque la ruta que se escribe desde afuera de la raíz
(`<empresa>-ops/planning`) y la que se escribe desde adentro (`planning`) difieren, y las dos se ven
razonables.

## Síntoma

Corrida real de `autobuild` sobre un hito con cinco tareas en cola, ninguna bloqueada y ninguna con
fila pendiente en `HUMAN_ACTIONS`:

| fase | qué devolvió |
|---|---|
| Triage → `planning-context` | `hasTask: false`, `queued: 0` |
| Pick | «no hay tarea» → expandió la épica siguiente |
| Pick (otra vez) | `hasTask: false`, `queued: 0` |
| Closing | `check` verde, ahora con 11 en cola |

Resultado devuelto por el recorrido: `{"done":[],"count":0,"hito":"","phases":["Triage","Pick","Closing"]}`.

Cinco agentes, ~343k tokens, **cero tareas construidas** y **seis historias nuevas escritas en
`BACKLOG.md`** —con su hito, su prosa y sus referencias a la ADR que fija el orden— sin que ninguna
persona las promoviera. La expansión estaba bien hecha, y eso es parte del problema: se lee como
trabajo legítimo y nada en el archivo dice que la escribió un runner sobre una lectura fallida.

El `check` final da **verde**, porque once tareas en cola es un estado válido. Nada avisa.

## Causa raíz

Son **tres** capas, y la primera es del propio adaptador:

0. **El workflow lleva su raíz escrita y relativa al cwd de los agentes.** `automation install`
   completa `const ROOT = '<empresa>-ops/'` con el comentario «relativo a la carpeta donde se abre la
   herramienta, que es el cwd de los agentes». Cuando el cwd **no** es esa carpeta —basta con que la
   sesión haya hecho `cd` a la raíz de ops en algún momento, que es lo más natural del mundo porque
   ahí viven `tools/ops.js` y el `Makefile`— todas las rutas del recorrido resuelven a
   `<empresa>-ops/<empresa>-ops/...` y ninguna existe. No hay comprobación de que `ROOT` sea legible
   antes de empezar; una sola línea al arrancar Triage —«¿existe `${CONFIG}`?»— convertiría esto en un
   fallo con nombre en vez de una corrida que promueve.

Y sobre eso, dos decisiones que por separado son razonables y juntas producen el daño:

1. **`context` no distingue ausencia de vacío.** Devolver `queued: 0` con exit 0 para una ruta
   inexistente hace que el error se propague como dato, no como fallo. Es el mismo patrón que 0.63.0
   corrigió para el índice de git —«un índice que no se puede leer deja de autorizar el commit»,
   porque `stagedFiles` devolvía lista vacía tanto si estaba vacío como si falló—. Acá vuelve a
   aparecer, en otro comando.

2. **`autobuild` toma la cola vacía como permiso para promover.** BR-OPS-002 dice que las propuestas no
   se autopromueven y `AGENTS.md` que el runner «nunca amplía el alcance ni promueve sus propias
   ideas». Expandir una épica aprobada al BACKLOG es un caso de borde defendible cuando la cola está
   *realmente* vacía; sobre una lectura fallida no lo es, y la fase no tiene cómo saber la diferencia
   porque el CLI no se la da.

## Fix propuesto

Lo primero es lo barato y arregla la clase entera:

```diff
  ops context <planning-dir>
+   Si <planning-dir> no existe o no se puede leer, error con exit != 0 y un mensaje que nombre la
+   ruta resuelta. En --json, un campo `error` en vez de una respuesta que se lee como estado válido.
```

Lo segundo cierra el borde aunque el primero falle:

```diff
  Pick: la próxima tarea, o la épica que falta expandir
+   Expandir exige haber leído el planning con éxito Y que el BACKLOG exista y esté vacío de tareas
+   abiertas. Ante cualquier duda sobre la lectura, parar con `not-ready` en vez de promover: una
+   parada cuesta una corrida y una promoción indebida entra al repositorio.
```

Y un tercero que no depende de los otros dos: que la expansión **deje dicho quién la escribió**. Hoy
el hito que emite es indistinguible de uno escrito por una persona.

## Tradeoffs

- Hacer que `context` falle sobre una ruta inexistente **puede romper scripts** que hoy tratan la
  salida vacía como «nada que hacer». Es el mismo tradeoff que 0.67.0 aceptó al cambiar el código de
  salida de `upgrade`, y va en la misma dirección: un comando que no puede leer no responde como si
  hubiera leído.
- Endurecer Pick le quita a `autobuild` la capacidad de encadenar épicas sin intervención. Eso es una
  pérdida real para quien lo usa desatendido, y la contrapartida es que hoy esa capacidad se dispara
  también cuando no debe.

## Contexto de descubrimiento

Instancia real (sidecar, 0.70.0), 2026-09-08. Se lanzó `autobuild` sobre un hito recién promovido de
cinco tareas, con el entorno verificado y sin bloqueos. El disparador fue el cwd: la sesión venía
trabajando dentro de la raíz de ops y los agentes lo heredaron, así que el `ROOT` escrito del workflow
se duplicó. Nada en la corrida lo dijo. Volvió en 230 s diciendo que no había nada que
hacer, con el BACKLOG seis historias más largo. La cola nunca estuvo vacía: `ops context planning`
—ruta correcta— devolvía la primera tarea antes, durante y después de la corrida.

El diagnóstico salió del `journal.jsonl` del recorrido, no de su resultado: el resultado dice
`{"done":[],"count":0}`, que se lee como «no había trabajo».

## Relacionados

- **0.63.0, «Un índice que no se puede leer deja de autorizar el commit»** — la misma falla, resuelta
  en `stagedFiles`. Este caso es esa lección sin aplicar en `context`.
- **BR-OPS-002** — las propuestas no se autopromueven. Es la invariante que esto rompe.
- **`AGENTS.md`, Autonomía** — «nunca amplía el alcance, promueve sus propias ideas…». La expansión de
  épicas vive en la frontera de esa regla y convendría que el texto dijera dónde está la línea.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró, contra las tres capas de «Causa raíz», los tres
bloques de «Fix propuesto» y las dos predicciones de «Tradeoffs» — no sólo contra el fix:

- **Causa raíz 0, «el workflow lleva su raíz escrita y relativa al cwd» — se hizo distinto.** No se agregó
  la comprobación de `${CONFIG}` al arrancar Triage que el caso sugería: el runtime de workflows no expone
  `process`, así que esa línea no puede ser un `fs.existsSync` y tendría que gastar un agente. Lo que sí
  cambió es que el recorrido ya no puede **actuar** sobre esa raíz rota — para en Pick con
  `context-unavailable`—. El daño queda cerrado y el diagnóstico sigue peor de lo que podría: para tarde y
  el mensaje habla del planning, no del `ROOT`. Sale como caso propio, **058**.
- **Causa raíz 1, «`context` no distingue ausencia de vacío» — hecho.** `context` y `tree` salen con
  código 2 sobre una raíz que no existe o que no tiene `BACKLOG.md`, nombrando la ruta resuelta. `tree` no
  estaba en el enunciado y se arregló igual: mismo defecto y misma línea, y un árbol vacío se lee como un
  roadmap sin épicas en vez de como una ruta equivocada.
- **Causa raíz 2, «`autobuild` toma la cola vacía como permiso para promover» — hecho, y no alcanzaba con
  lo anterior.** El esquema se completa igual aunque el comando falle, y `hasTask: false, queued: 0` es
  justamente lo que un modelo escribe cuando no tiene qué poner. El informe de estado ahora declara si
  leyó (`readOk`), el prompt lo ata al código de salida, y expandir exige esa lectura afirmada.
- **Fix 3, «que la expansión deje dicho quién la escribió» — no se hizo.** Es independiente de los otros
  dos y sigue siendo cierto: un hito que emitió el runner se lee igual que uno escrito por una persona.
  Sale como caso propio, **057**.
- **Tradeoff 1, «puede romper scripts que tratan la salida vacía como nada que hacer» — comprobado, y
  rompió.** Los consumidores dentro de este repositorio eran el harness de `autobuild` y dos casos de
  prueba que daban por buena la respuesta vacía; los tres se actualizaron. Hacia afuera queda como cambio
  de comportamiento anunciado en el CHANGELOG, con la misma razón que el de `upgrade` en 0.67.0.
- **Tradeoff 2, «endurecer Pick le quita a `autobuild` encadenar épicas» — comprobado, y resultó más chico
  de lo previsto.** La capacidad se pierde **sólo cuando la lectura falló**: con el planning legible y la
  cola de verdad vacía la expansión sigue corriendo, y la prueba «sin tarea en cola se expande la próxima
  épica y se sigue con ella» sigue en verde. Lo que se perdió es promover a ciegas.
- **La prioridad alta, «escribe en `BACKLOG.md` trabajo que ninguna persona aprobó» — cerrada por las dos
  vías.** El comando falla y la fase exige la lectura afirmada. Ninguna se apoya en la otra a propósito,
  porque el caso mostró que la primera sola no bastaba.
- **«Relacionados» dejaba una acción sin destino y no se pierde.** El caso cierra diciendo que la
  expansión de épicas «vive en la frontera» de la regla de autonomía de `AGENTS.md` y que «convendría que
  el texto dijera dónde está la línea». Eso no se hizo acá: el texto vive en `template/`, así que tocarlo
  baja a todos los consumidores en su próximo `upgrade` y es una decisión, no una redacción. Entra al
  alcance del **057**, que ya trata sobre la expansión, en vez de abrir un caso más.
- **Lo que el caso no preveía y apareció al arreglarlo.** `tree` tenía el mismo defecto y nadie lo había
  mirado. Y el harness de pruebas de `autobuild` **codificaba la confusión**: su fixture de «sin tarea»
  servía igual para «no pude leer», así que la suite entera venía dando por bueno el estado ambiguo.
