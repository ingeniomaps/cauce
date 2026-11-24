---
caso: 535
titulo: un WIP que apunta a una tarea ya en done/ pasa `check` y `ops context` la ofrece como la tarea en curso
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.1
---

# 535 — un WIP que apunta a una tarea ya en done/ pasa `check` y `ops context` la ofrece como la tarea en curso

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **media**: el costo es una vuelta perdida o reconstruir lo hecho. No
hay incidente medido por este camino; el del 463, que llega al mismo lugar por otro, costó 594k tokens en una instancia.

## Resumen

Si una sesión se corta entre escribir `done/<slug>.md` y dejar el WIP en IDLE (paso 13 de Done), queda un WIP activo
que apunta a una tarea cerrada. `PROTOCOL.md:72` lo prevé en prosa: «Si WIP apunta a una tarea ya en DONE y fuera de
BACKLOG, reparar el cierre dejando WIP en IDLE». Pero `check` no lo avisa, y `ops context` presenta esa tarea como la
de la sesión y le sugiere `ops claim`, que después la rechaza.

## Reproducción

En un banco con `done/alta-de-cliente.md` escrito y la tarea fuera de la cola:

```bash
cat > planning/wip/banco.md <<'EOF'
---
task: alta-de-cliente
epic: 001
phase: Build
started: 2026-11-20
service: api
acceptance: "el alta rechaza un duplicado"
lane: lite
---

## Plan aprobado
1. [x] Validar duplicado
2. [ ] Correr la suite
EOF
node tools/ops.js check planning; echo "exit=$?"
CAUCE_RUNNER=banco node tools/ops.js context planning
CAUCE_RUNNER=banco node tools/ops.js claim planning alta-de-cliente; echo "exit=$?"
```

## Síntoma

```
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)
exit=0
TASK   alta-de-cliente [lite]  service: api
WIP    Build · 1✓/1○
CLAIM  libre — tomala con `ops claim <planning> alta-de-cliente`
…
alta-de-cliente no está en BACKLOG: sólo se toma trabajo ya promovido.
exit=2
```

`context` dice qué hacer y `claim` se niega a hacerlo. Es la misma contradicción que el comentario de
`engine/cli/planning.js:184-186` dice haber cerrado para los reclamos.

## Causa raíz

- `engine/planning/contracts.js:231-235`: el WIP sólo falla si su tarea no está **ni** en BACKLOG **ni** en DONE. Estar
  en DONE la da por buena.
- `engine/cli/planning.js:182`: `context` toma el WIP propio sin mirar si su tarea está en DONE. Tres líneas más abajo,
  `:187`, los reclamos sí se filtran (`!state.done.set.has(one.slug)`); el WIP quedó afuera de ese filtro.

## Fix propuesto

- `check`: aviso `wip/<runner>.md: <slug> ya está en done/; el cierre quedó a medias — dejá el WIP en status: IDLE`.
  Aviso y no error, porque el WIP no viaja por git y lo que se arregla es local.
- `context`: con el WIP apuntando a una tarea hecha, no ofrecerla. Decir que el cierre quedó a medias y que lo que
  sigue es el paso 4 de Triage, en vez de sugerir `claim`.

La reparación es escribir `status: IDLE` (R28: el estado lo dice el contenido), nunca borrar el archivo.

## Tradeoffs

- Que el WIP rancio se repare solo —que `context` lo deje en IDLE— sería más cómodo y es una escritura que nadie pidió
  sobre el estado de una sesión. Queda en avisar y decir qué hacer.
- `/autobuild` no lee el WIP por su lado: toma tarea y WIP de `ops context --json`
  (`automatization/workflows/autobuild.js:963-968`), y con este estado recibe
  `{"task":"alta-de-cliente","wip":{"phase":"Build","complete":1,"pending":1},"claimed":false}`. O sea que hoy la
  retomaría como reanudación (`autobuild.js:1434`, `resumedFromWip`) sobre una tarea cerrada. Arreglar `context` lo cubre,
  y la prueba de autobuild tiene que mirar que no la retome, no sólo que `context` cambie el texto.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que escribió su propio aviso en `check` («Triage la va a
retomar y reconstruir») después de cerrar tareas fuera del recorrido.

## Relacionados

- 463 (aplazado): cerrar una tarea con otro slug hace que la cola la vuelva a ofrecer; mismo costo por otro camino.
- 529: una épica `open` terminada que no pide cerrar; otra mitad de cierre que `check` no ve.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, aviso en `check`**: se hizo en `engine/planning/contracts.js` (`staleWips`). Nombra el WIP y la tarea,
  y manda a dejarlo en `status: IDLE` citando el punto 4 de los gates de arranque del PROTOCOL; el caso decía «paso 4 de
  Triage», y lo que el PROTOCOL numera así es ese gate.
- **Fix propuesto, `context`**: se hizo en `engine/planning/state.js` (`ownWip`) y `engine/cli/planning.js`. Con el WIP
  sobre una tarea hecha, `context` no la ofrece ni manda a reclamarla, imprime una línea `STALE`, y su JSON trae
  `wip: null` con `staleWip`. Con trabajo en la cola ofrece ése, y con un reclamo propio, el reclamado.
- **La reparación es escribir `status: IDLE`**: así lo dicen el aviso y la línea `STALE`; nada borra el archivo.
- **Tradeoffs, que se repare solo**: no, como decía el caso. Queda en avisar y decir qué hacer.
- **Tradeoffs, la prueba de `/autobuild` tiene que mirar que no la retome**: hecho, con una corrida real (abajo). El
  registro del workflow muestra las tres lecturas de planning de antes de construir con `wipActive: false` sobre el WIP
  rancio; el recorrido tomó la tarea de la cola, escribió su WIP encima del rancio y la cerró.
- **Lo que el enunciado no preveía**: los guards `planFirst` y `scopeAlive` siguen leyendo el WIP rancio como activo. Eso
  es anterior a este cambio y queda anotado. Además, la línea `WIP idle` sigue saliendo debajo de `STALE`.

Lo que se corrió:

- Línea de base, en «Síntoma»: `context` ofrecía la tarea cerrada y mandaba a reclamarla.
- Después, `repro-535.sh` en un banco (`repro-535-final.log`): `check` avisa con exit 0, `context` imprime `STALE` y
  `(sin tarea disponible)`, y `--json` da `{"task":null,"wip":null,"staleWip":"alta-de-cliente"}`.
- `test/planning/stale-wip.test.js`, 2 pruebas, en rojo contra HEAD y en verde después.
- 7 mutaciones en una copia, las 7 rojas.
- **Corrida real de `/autobuild`**, 2026-11-22, Claude Code 2.1.330 por `claude -p`, sobre un banco `sidecar` fuera del
  árbol con el motor congelado en `69d16fa6`. El banco traía `alta-de-cliente` en `done/`, un WIP en `phase: Build`
  apuntándola para cada forma del runner (la sesión, `ops/` y `app/`) y `sumar-dos-numeros` en cola. USD 8,37, unos
  13 minutos.
  - El registro del workflow (`journal.jsonl`) da `hasTask: true, wipActive: false` en las lecturas de Triage, sobre
    `wip/var-tmp-cauce-run-535-ops.md`, que era uno de los rancios.
  - No retomó `alta-de-cliente`: construyó y cerró `sumar-dos-numeros`, con commit `c4cb7f4` en `app`. Su WIP quedó
    en `status: IDLE`.
  - El informe final nombró los dos WIP rancios que quedaban, los de las otras dos formas del runner, y propuso
    dejarlos en IDLE sin hacerlo, como pide el caso.
  - Una primera corrida con `bypassPermissions` y sin tope de espera se paró a los dos minutos; no cuenta.

**Sin probar:** nada más.

### Lista de cierre

1. hecho: la reproducción de «Reproducción» en un banco, antes en «Síntoma» y después en `repro-535-final.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas en rojo contra HEAD y en verde después.
4. hecho: 7 mutaciones en una copia, las 7 rojas.
5. hecho: quita la tarea ofrecida y el `claim`; la prueba asierta su ausencia (`doesNotMatch`) y se vio en rojo contra HEAD.
6. hecho: banco con la CLI real, sin dobles, para `check` y `context`.
7. hecho: la corrida real de `/autobuild` que el caso pide, autorizada por la persona; no retomó la tarea cerrada.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: WIP rancio solo, con cola y con un reclamo propio; WIP en IDLE y WIP sobre una tarea abierta.
10. hecho: dependían `context`, su JSON y `check`; `planFirst` y `scopeAlive` se revisaron y quedan anotados arriba.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
