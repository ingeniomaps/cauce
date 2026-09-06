---
caso: 021
titulo: No hay forma de adoptar una historia anterior al contrato de evidencia
estado: resuelto
prioridad: media
version-detectada: 0.60.1
resuelto-en: 0.61.0
---

# 021 — Adoptar un proyecto con historia obliga a escribir la exención entrada por entrada

**🟢 resuelto en 0.61.0** · detectado en 0.60.1 · prioridad **media** — la fricción cae justo en el primer día

## Resumen

`check` exige a **toda** entrada de `DONE.md` los mismos campos: `acept:`, `done:`, `qa:`, `commit:` y
`tests:` con su traza criterio→prueba. Es la regla correcta para lo que se construye desde ahora, y es
imposible para lo que ya estaba: un proyecto que llega con historia la escribió bajo otro contrato, o
sin ninguno.

No hay mecanismo de adopción. Las salidas son escribir `tests: n/a — razón` en cada entrada vieja, que
mezcla la exención con la evidencia real, o dejar `check` en rojo permanente, que enseña a ignorarlo.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.60.1 init ops --mode sidecar --install

cat >> ops/planning/DONE.md <<'EOF'

## Hito viejo — Trabajo anterior a la adopción

- [x] **tarea-de-2024** — Lo que se construyó entonces.
  done: lo que se hizo, que es lo único que aquel proceso registraba
EOF

node ops/tools/ops.js check ops/planning
```

## Síntoma

```
✗ DONE.md tarea-de-2024: falta acept:
✗ DONE.md tarea-de-2024: falta qa:
✗ DONE.md tarea-de-2024: falta commit:
✗ DONE.md tarea-de-2024: falta tests:
```

Cuatro errores por entrada, multiplicados por la historia que tenga el proyecto. En la migración donde
apareció eran 94 entradas y 224 errores.

## Causa raíz

El concepto no existe en el motor: `grep -rni baseline engine/` no devuelve nada.

Y los cuatro errores **no salen del mismo lugar**, que es lo que decide dónde va la exención. Tres de
los cuatro los emite el bucle sobre `done.entries` dentro de `validateState`,
`engine/planning/contracts.js:398-402`:

```js
for (const entry of done.entries) {
  if (!entry.acceptance) errors.push(`${entry.source} ${entry.slug}: falta acept:`)
  if (!entry.done) errors.push(...)
  if (!entry.qa) errors.push(...)
  if (!entry.commit) errors.push(...)
  ...
  errors.push(...validateDoneEntry(entry, story ? story.criteria : []))
}
```

El cuarto —`falta tests:`— lo emite `validateDoneEntry` en `contracts.js:49`. O sea que exentar sólo
dentro de `validateDoneEntry` apaga uno de los cuatro y deja tres vivos: sobre las 94 entradas de la
migración serían 168 errores en lugar de 224.

Ninguna de las dos funciones está mal —hacen lo que su prosa promete— sino que falta una pieza al lado.
Y el `README` de `docs/issues` deja ver que el caso importa: adoptar Cauce en un repositorio con
contenido es un camino declarado (`init --force`), no un borde.

## Fix propuesto

Un archivo de adopción, con la forma que ya tenía el sistema del que salió esto:

```
ops/planning/.adoption-baseline
# Entradas anteriores a la adopción de Cauce (2026-09-03). No se agregan nuevas:
# desde esa fecha rige el contrato completo.
tarea-de-2024
otra-tarea-vieja
```

La exención va **en el bucle de `validateState`**, que es el único punto por el que pasan los dos
grupos de errores: para un slug del baseline se saltean las cuatro comprobaciones de `falta …` y no se
llama a `validateDoneEntry`. Tres propiedades que conviene conservar:

- **Se genera una vez**, con un comando (`ops adopt <planning>`), y no se edita a mano después.
- **`check` lo muestra**: «12 entradas exentas por adopción», para que la exención se vea en cada
  corrida en vez de esconderse.
- **No admite entradas nuevas**: si un slug aparece en el baseline y su entrada se escribió después de
  la fecha declarada, eso es un error propio.

> **Lo que salió en 0.61.0 fueron las dos primeras.** La tercera **no se implementó**: el motor no lee la
> fecha del encabezado y nada compara un slug contra cuándo se escribió su entrada. Saber eso exige
> fechar una entrada de DONE —`git blame` sobre el archivo, o el commit que la trajo—, y en un
> repositorio que adoptó Cauce ese archivo puede haberse reescrito entero, así que el dato es caro y
> poco confiable justo donde haría falta.
>
> Lo que cubre el propósito mientras tanto: `adopt` se niega sobre un baseline que ya existe, así que la
> lista no crece por herramienta, y `check` muestra la cuenta en cada corrida, así que una que creció se
> ve. Lo que queda descubierto es agrandarla a mano.
>
> Lo que cerraría la dimensión: una forma barata y confiable de fechar una entrada de DONE. Hasta
> entonces la propiedad queda enunciada acá y sin mecanismo, que es distinto de haberla cumplido.

Lo que la exención **no** puede ser es «perdonar campos ausentes». Una entrada vieja que sí trae
`commit:` con el formato de otro sistema dispara `commit debe apuntar a <sha> <asunto>`
(`contracts.js:58-59`), y `tests:` con una traza ajena dispara `tests debe rastrear A/CN → prueba`
(`50-52`). El perdón es por entrada, no por campo faltante.

Dos cosas que **no** hace falta tocar, comprobadas leyendo el código:

- El cierre de épica (`contracts.js:94-97`) sólo pregunta si el slug está en `done`, no qué campos
  trae, así que una entrada exenta lo satisface igual.
- El cruce criterio→prueba (`53-56`) sólo corre si `tests:` rastrea algo; con el campo ausente queda
  inerte. Y `decisions:` es opcional hoy: `validDecisionTrace('')` devuelve `true` (línea 18-21), que
  es por qué el síntoma tiene cuatro líneas y no cinco.

La alternativa —lo que se hizo— es escribir `tests: n/a — entrada pre-adopción` en cada una. Funciona y
es honesta, pero deja la exención dentro del campo de evidencia, donde alguien la va a copiar en una
entrada nueva sin que nada lo frene.

## Tradeoffs

Un baseline es una lista de perdones y envejece: hay que decidir si se puede achicar sola cuando una
entrada vieja se reescribe, o si es inmutable. Lo primero es más útil y más difícil de explicar.

Perdonar por slug asume que los slugs no se repiten. Hoy `readDone` ya reporta duplicados, así que el
supuesto está sostenido por algo.

`ops adopt` es un comando nuevo, o sea superficie de CLI que después hay que mantener y documentar. La
variante sin comando —un campo con fecha en `ops.config.json` y exención por hito— evita el archivo y
el comando, pero pierde la propiedad que hace sano al baseline: que la lista se pueda mirar y achicar
entrada por entrada.

## Contexto de descubrimiento

Migrando `gouduet` de su sistema propio a Cauce (2026-09-03). Ese sistema **tenía** el mecanismo:
`planning/.check-baseline` con 89 slugs y `planning/.trace-baseline` con 3, cada uno con su cabecera
explicando desde cuándo no se agregan más. Las 94 entradas del proyecto estaban cubiertas por esos dos
archivos: 92 exentas y 2 escritas ya bajo el contrato completo, que es exactamente lo que un baseline
sano debería mostrar.

Al migrar, esa distinción no tenía dónde ir.

## Relacionados

- [019](019-los-campos-de-done-se-leen-de-una-sola-linea.md) — el otro caso que salió de la misma
  migración, también sobre las entradas de DONE. No comparten causa: acá falta una pieza al lado de la
  validación, allá el defecto es de lectura.
