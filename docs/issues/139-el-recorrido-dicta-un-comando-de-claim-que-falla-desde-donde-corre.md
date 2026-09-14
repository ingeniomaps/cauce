---
caso: 139
titulo: El recorrido le dicta al agente un comando de claim que falla con exit 2 desde el directorio en el que está trabajando
estado: resuelto
resuelto-en: 0.89.0
prioridad: baja
version-detectada: 0.87.0
---

# 139 — La consigna de Claim trae una ruta relativa que no resuelve desde la instancia

**🟢 resuelto en 0.89.0** · detectado en 0.87.0 · prioridad **baja** — el agente lo resolvió solo, pero
pagó una vuelta y lo dejó anotado

## Resumen

La fase Claim del recorrido `autobuild` le entrega al subagente el comando a correr con el planning como
ruta relativa. El agente lo corrió tal cual desde la instancia y recibió:

```
$ node tools/ops.js claim <empresa>-ops/planning retirar-guias-mcp-obsoletas
exit 2 — no existe el planning en <workspace>/<empresa>-ops/<empresa>-ops/planning (ruta resuelta)
```

La ruta se duplica porque `<empresa>-ops/planning` se resuelve contra el cwd, y el cwd ya es `<empresa>-ops/`.
El agente lo reintentó desde la raíz del workspace y ahí funcionó.

## Reproducción

Instancia sidecar 0.87.0. Correr el recorrido y mirar el resultado de la fase Claim, que lo reporta
textual:

> Nota sobre la invocación: el comando tal como venía en la consigna —`node tools/ops.js claim
> <empresa>-ops/planning <slug>` desde `<workspace>/<empresa>-ops`— falla con exit 2. El
> argumento se resuelve contra el cwd, así que hay que correrlo desde la raíz del workspace.

## Síntoma

No rompe nada: el error es claro —imprime la ruta resuelta, que es exactamente lo que hace falta para
entenderlo— y un agente capaz lo corrige. Lo que cuesta es la vuelta, y en un recorrido donde cada
subagente arranca de cero esa vuelta no es gratis: son decenas de miles de tokens para descubrir algo que
la consigna podía traer bien.

Y hay un costo peor que el de esta corrida: el agente que **no** lo resuelve concluye que el planning no
existe.

## Fix propuesto

> **Corregido al contrastarlo contra el fuente.** Lo que sigue es lo que este caso proponía, y su premisa
> es falsa: la fase Claim **sí** dice desde dónde correr. `autobuild.js` dicta
> `Corré "node tools/ops.js claim ${P} ${task.id}" desde ${ROOT}`. El defecto está una capa abajo y lo
> explica la sección siguiente.
>
> ~~Que la consigna traiga la ruta ya resuelta, o que diga desde dónde correrla. El recorrido conoce las
> dos cosas —`ROOT` y `P` están en su alcance y se usan en otras fases, donde sí dice «desde `${ROOT}`»—.
> La fase Claim es la que no lo dice.~~

Alternativa, que sigue en pie como idea y no se tomó: que `ops claim` resuelva el planning como lo hace
`run-hook.sh` con `OPS_ROOT`, subiendo hasta encontrar `ops.config.json`. Cambia el contrato del argumento
para todos los comandos, y anclar la raíz que ya se escribe al instalar alcanza sin tocarlo.

## Causa raíz

`automatization/shared/workflow-root.js`, que define la raíz de **los nueve recorridos**:

```js
const ROOT = '{{OPS_DIR}}'.replace(/\/+$/, '') || '.'
```

`{{OPS_DIR}}` lo completa `automation install` con el prefijo **relativo a la carpeta donde se abre la
herramienta**: vacío en `embedded`, `<empresa>-ops/` en sidecar. Así que en sidecar `ROOT` vale
`<empresa>-ops` y `P` vale `<empresa>-ops/planning`, y la consigna queda diciendo «corré
`claim <empresa>-ops/planning …` **desde** `<empresa>-ops`» — las dos mitades relativas, y las dos
resueltas contra el cwd del agente. Coinciden sólo si la sesión abrió exactamente donde el instalador
supuso; abierta en la instancia, el tramo se duplica.

El comentario de ese archivo lo decía sin saber que era el defecto: la raíz viaja «relativa a la carpeta
donde se abre la herramienta, **que es el cwd de los agentes**». Esa segunda mitad es la que no se cumple.

**El alcance es mayor que el que el caso describe.** No es la fase Claim: son las seis invocaciones que
`autobuild` dicta y las de los otros ocho recorridos, más cada ruta que viaja en un prompt.

## Tradeoffs

- Anclar la raíz obliga a escribirla **absoluta** en el archivo instalado, y una ruta absoluta se rompe si
  el proyecto se mueve de carpeta. Se repara reinstalando el adaptador, que es lo que ya hay que hacer
  cuando el wiring queda apuntando a otro lado.
- Toca `automatization/shared/`, así que **baja a cada empresa en su próximo `upgrade`**. No es una
  decisión de estilo.

## Cierre

**🟢 resuelto en 0.89.0** · `automatization/shared/workflow-root.js`,
`automatization/workflows/autobuild.js`, `automatization/shared/eval-measured.js`,
`engine/automation/runners.js`, `test/workflows/workflows-build.test.js`,
`test/workflows/autobuild.test.js`, `test/instance/instance.test.js`

`ROOT` pasa a la raíz **absoluta** que el instalador ya conoce, vía el marcador `{{OPS_ROOT}}` que el
motor tenía construido y usaban el puente de Antigravity y los hooks de Codex. Una línea, y con ella las
consignas de los nueve recorridos dejan de depender de dónde esté parado el agente.

### Contra lo que el caso enumeró

- **«Que la consigna traiga la ruta ya resuelta, o que diga desde dónde correrla»** — se hizo lo primero y
  lo segundo **ya estaba**. Contrastar la cita contra el fuente mostró que la fase Claim nombra `${ROOT}`
  desde siempre; construir sobre el diagnóstico escrito habría cerrado el caso sin tocar el defecto.
- **«La fase Claim es la que no lo dice»** — falso, y quedó corregido en el cuerpo con la tachadura a la
  vista en vez de reescrito en silencio: el caso se leía bien y por eso valía dejar por qué no lo era.
- **Alternativa de que `ops claim` suba buscando `ops.config.json`** — se decidió que no. Cambia el
  contrato del argumento para todos los comandos que reciben un planning, y anclar la raíz que ya se
  escribe al instalar cierra la clase sin tocarlo.
- **«Tradeoffs: ninguno relevante, es una cadena de prompt que ya tiene el dato al lado»** — resultó
  inexacto por la misma razón que el diagnóstico. No es una cadena de prompt: es la raíz compartida, y el
  cambio baja a cada instancia en su `upgrade` y paga una ruta absoluta en disco. Los dos tradeoffs reales
  quedaron escritos arriba.

### Lo que el caso no preveía

- **Una afirmación del motor quedó falsa y la encontró la puerta de duplicación, no mis búsquedas.**
  `engine/automation/runners.js` declaraba que `{{OPS_ROOT}}` «no reemplaza a `{{OPS_DIR}}` … la lleva
  sólo el que se queda sin alternativa». Después de este cambio sí lo reemplaza, en los nueve recorridos.
  La marcó R11 por solapamiento a 0.45; mis greps no la vieron porque buscaban «relativo» y ella decía
  «no reemplaza».
- **Un marcador escrito en prosa se rellena igual.** Mi comentario nuevo nombraba `{{OPS_ROOT}}` para
  explicar el costo, y `render` lo sustituyó **dentro del comentario**: el archivo instalado quedaba
  diciendo «el costo es el que nombra `/tmp/…/demo-ops` donde se define». Lo delató la prueba de
  autocontención, que compara el instalado contra el render.
- **Dos pruebas daban por sentado que la raíz era relativa**, y ninguna aparecía al buscar comentarios:
  una asercia el texto del `stop` de Triage (`/relativa a la carpeta/`) y la otra renderizaba sin pasar la
  raíz. Las dos se corrigieron conservando lo que protegían.
- **El guard que debía haber atrapado esto excluye los `.js`**, así que no mira ningún recorrido. Salió
  como **caso 145**, sin arreglar acá.

### Qué se corrió

- **Reproducción sobre el renderizado**, que es lo que recibe una empresa. Antes, en sidecar:
  `const ROOT = 'empresa-ops/'…`, y la consigna dictaba `claim empresa-ops/planning <slug>` desde
  `empresa-ops`. Después: `const ROOT = '/abs/empresa/empresa-ops'…`, y dicta
  `claim /abs/empresa/empresa-ops/planning <slug>` **desde** `/abs/empresa/empresa-ops`.
- **Rojo previo**: la prueba nueva falla contra el árbol de hoy en la aserción de sidecar, con
  `actual: 'empresa-ops'` contra `expected: '/abs/empresa/empresa-ops'`.
- **Mutación**, en copia por `tar` con verde de control 60/60: devolver el marcador a `{{OPS_DIR}}` mata
  **sólo** «en una instancia instalada, ROOT ancla…» y ninguna otra.
- **Pasada de comentarios R11 a 0.22**: el par que este cambio introdujo —`workflow-root.js` contra
  `runners.js`, en 0.250— desapareció al dejar la razón en un solo lugar. Lo que queda son pares
  código↔prueba preexistentes, con el fondo en 0.378.
- **Verde**: `npm run ci` en 0 y **816 pruebas**.

## Contexto de descubrimiento

Corrida real del `autobuild` el 2026-09-14, instancia sidecar. Lo reportó el propio agente de la fase
Claim en su resultado, sin que nadie se lo preguntara.

## Relacionados

- **137**, **138** — misma familia: supuestos sobre el directorio desde el que se invoca, en sidecar.
- **145** — la puerta que debía haber atrapado esto y no mira los recorridos. Salió de cerrar éste.
