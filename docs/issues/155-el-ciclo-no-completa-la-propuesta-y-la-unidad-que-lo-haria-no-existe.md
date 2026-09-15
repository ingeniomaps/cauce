---
caso: 155
titulo: El ciclo deja la propuesta mensual en «por definir» y el paso que la completaría lo difieren dos casos sin abrir ninguna unidad
estado: resuelto
resuelto-en: 0.92.0
prioridad: media
version-detectada: 0.90.0
---

# 155 — El paso que completa el ciclo lo difieren dos cierres y nadie lo tiene

**🟢 resuelto en 0.92.0** · detectado en 0.90.0 · prioridad **media** — el job consolida y ahora escribe
el cambio concreto; sin credencial avisa y deja el mes como estaba, en vez de romper el ciclo

## Resumen

`learn --proposal` consolida qué recomendaron los informes del mes y deja **«Cambio propuesto: por
definir»**. Eso no es aprobable: nadie firma una intención. El recorrido que convierte esa intención en
el texto exacto que habría que agregar —archivo por archivo, contrastado contra los casos adversariales
vigentes— **ya está escrito**: `automatization/workflows/agent-propose.js`.

El job `propose` de `agent-learning.yml` **no lo corre**, y lo dice él mismo en un comentario: «lo llena
`/agent-propose`, que este job no corre». Medido el 2026-09-15 sobre las propuestas de `2026-09`: de **25**
archivos, **15** quedaron archivados con el texto del molde intacto y **10** se aplicaron —los que alguien
completó a mano—.

## Por qué es una unidad propia y no la cola de otro caso

Dos cierres lo difieren, los dos con la misma fórmula y sin nombrar a nadie:

- **135**: «Sigue siendo el paso que falta para que el ciclo se complete solo, y eso es trabajo de otra
  unidad.»
- **143**: «Eso es otra unidad, y ahora es menos urgente: lo que dolía era la firma gastada.»

Las dos decisiones fueron correctas —ninguno de los dos casos tenía por qué meter un modelo en un job
diseñado sin ninguno— y las dos dejaron la dimensión sin destino. R15 dice que una línea así tiene
exactamente dos salidas y ninguna es el silencio: se hace, o sale como unidad propia. Éste es el segundo
destino, con dos cierres de atraso.

## Reproducción

El workflow nombra `agent-propose` dos veces y **ninguna es una invocación**: las dos están dentro del
comentario que explica por qué no lo corre. Un `grep` a secas devuelve esas dos líneas y se lee como lo
contrario, así que hay que mirar qué son:

```bash
grep -n "agent-propose" .github/workflows/agent-learning.yml   # dos, y las dos en un comentario
grep -nE "^\s*(npx|node|gh|claude).*agent-propose" .github/workflows/agent-learning.yml   # ninguna
```

Y el resultado en disco, del mes que ya pasó:

```bash
ls agents/roles/system/*/learning/proposals/2026-09.md | wc -l          # 25
grep -l "Por definir tras revisar los hallazgos" \
  agents/roles/system/*/learning/proposals/2026-09.md | wc -l           # 15
```

## Causa raíz

No hay defecto en ningún archivo: el recorrido existe y hace lo suyo, y el job hace lo suyo. Lo que falta
es la decisión de conectarlos, y esa decisión tiene un costo que ningún caso anterior quiso asumir de
paso — mete un modelo, su credencial y su gasto en un job que hoy corre sin ninguno.

## Fix propuesto

No está decidido; lo que falta primero es elegir quién paga el costo del modelo.

1. **Que el job `propose` invoque `/agent-propose`** tras consolidar. Es el camino directo y el que los
   dos cierres nombran. Hay que resolver de dónde sale la credencial y qué pasa si el recorrido falla a
   mitad: la propuesta quedaría peor que en «por definir».
2. **Un job aparte, disparado a mano**, que corra el recorrido sobre las propuestas que quedaron en
   «por definir». Más barato de decidir y deja el ciclo incompleto por diseño, pero con una salida que
   alguien puede ejecutar sin construir nada nuevo.
3. **Declararlo y no conectarlo**, dejando escrito en el `AGENTS.md` que la propuesta mensual se completa
   a mano con `/agent-propose`. Es lo que de hecho pasa hoy, sin que esté escrito.

## Tradeoffs

- La 1 mete un modelo en el job del ciclo, que es exactamente lo que el 135 y el 143 evitaron a propósito.
- La 2 deja el ciclo sin cerrarse solo, que es el problema original, pero acota el gasto a cuando alguien
  lo pide.
- La 3 no cuesta nada y sólo documenta el hueco.
- **Vale la pena mirar cuánto costaría una corrida de `/agent-propose` por cargo**, porque con 53 cargos
  la diferencia entre la 1 y la 2 es un número y no una opinión.

## Prioridad

**Media.** No rompe nada: las propuestas se archivan y el ciclo sigue. Lo que cuesta es que el trabajo de
investigación de cada semana llega hasta la puerta de la decisión y no la cruza, y que eso ya lleva dos
cierres diferido sin que nadie lo tenga.

## Contexto de descubrimiento

Salió de la auditoría del 2026-09-14 sobre los cierres del repositorio, que buscaba dimensiones
declaradas sin destino. Fue el único hallazgo con consecuencia práctica de ese barrido, y se confirmó el
2026-09-15: `agent-propose` aparece en dos casos y en ningún caso propio.

## Relacionados

- **135** y **143** — los dos cierres que lo difieren sin nombrarlo.
- **142** — la ola de propuestas archivadas con el molde intacto, que es lo que este hueco produce.

## Cierre

**🟢 resuelto en 0.92.0** · `.github/workflows/agent-learning.yml`, `test/repo/ci-schedule.test.js`,
`CHANGELOG.md`

Se tomó la **opción 1**, y lo que la desbloqueó fue contrastar la premisa que la había diferido dos veces.

### La objeción que difirió el caso era falsa

El 135 y el 143 lo postergaron para no meter «un modelo, su credencial y su gasto en un job que hoy corre
sin ninguno». Eso era cierto **del job `propose`** y no del workflow: `agent-learning.yml` ya corre un
modelo en el job que investiga, con `CLAUDE_CODE_OAUTH_TOKEN` y reintento a `ANTHROPIC_API_KEY`, su
timeout y su aviso cuando no hay credencial. El paso nuevo reusa esa resolución en vez de decidirla de
nuevo, así que lo que quedaba no era una decisión de diseño sino cableado.

### Contra lo que el caso enumeró

- **Opción 1, que el job invoque `/agent-propose` tras consolidar** — **se hizo.** El paso corre entre
  `Validate proposal` y `Detect changes`, para que lo que el recorrido escriba entre al mismo
  `git status` que arma el PR. Un workflow no se ejecuta desde el fuente —trae `{{INCLUDE:}}`— así que se
  renderiza a `.claude/workflows/` con el mismo `render` que usa `make eval-workflows`, y falla si queda
  un include sin expandir en vez de escribir un archivo que reventaría en el primer agente.
- **Sus dos preguntas abiertas, contestadas.** *De dónde sale la credencial*: de los mismos secrets que ya
  usa el workflow. *Qué pasa si el recorrido falla a mitad*: la propuesta **no** queda peor que en «por
  definir» — queda exactamente ahí, que es el estado que ya tenía. Sin credencial, con la suscripción
  caída o con el respaldo fallando, el paso avisa y sale en cero; la rama se empuja igual con sus sellos,
  y la condición que decide si se pide firma sigue mirando el documento y no quién lo llenó.
- **Opción 2, un job aparte disparado a mano** — **se decidió que no.** Era más barata de decidir porque
  evitaba el gasto recurrente, y ese gasto dejó de ser una incógnita al medirlo. Deja además el ciclo sin
  cerrarse solo, que es el problema original.
- **Opción 3, declararlo y no conectarlo** — **se decidió que no.** Documentaba el hueco en vez de
  cerrarlo, y el recorrido que lo cierra ya existía escrito.
- **Tradeoff «la 1 mete un modelo en el job del ciclo»** — **se paga, y es menos de lo que parecía**: el
  workflow ya lo tenía, y el paso corre **sólo** sobre las propuestas que quedaron en «por definir»,
  leyendo el veredicto que `learn` ya emitió. Las que alguien completó a mano no cuestan nada.
- **«Vale la pena mirar cuánto costaría una corrida de `/agent-propose` por cargo»** — **medido**, y es lo
  que volvió defendible la 1 frente a la 2: ≈ **18.300 tokens de entrada por cargo** —27.332 B de insumos
  promedio más dos preámbulos de 23 KB (caso 141), sobre las dos llamadas que el recorrido hace— por los
  **25** cargos que consolidan, del orden de **460.000 tokens al mes**. El caso decía que la diferencia
  entre las dos opciones «es un número y no una opinión»; éste es el número.

### Qué se corrió

- **Reproducción:** el workflow nombraba `agent-propose` dos veces y ninguna era invocación —las dos
  dentro del comentario que explicaba por qué no lo corría—, y de **25** propuestas de `2026-09`, **15**
  quedaron con el molde intacto contra 10 completadas a mano.
- **Rojo previo** con el paso quitado en una copia desechable: **2 rojas de 15**, y son las dos del
  arreglo.
- **Tres mutaciones.** Quitar la condición para que corra siempre → 1 roja. Convertir el aviso sin
  credencial en error → 1 roja, la de la degradación. Mover el paso después de `Detect changes` → 1 roja,
  porque la propuesta completada se quedaría en el runner.
- **El render se ejecutó de verdad:** 7.014 B con todos los `{{INCLUDE:}}` expandidos y `finish`/`stop`
  adentro.
- `npm run ci` **exit 0 — 874 pruebas, 0 en rojo**, sin superficie muerta y 71 archivos en su piso.

### Lo que el caso no preveía

**El paso no puede conceder `Bash`.** La puerta que cuida los permisos del modelo cuenta las formas
`'Bash(...)'` **sobre el archivo entero**, así que una quinta acá se leería como un permiso más del job
que investiga. `agent-propose` pide dos comandos del CLI en su fase de contexto; sin ellos el agente
trabaja con lo que lee del disco y lo que no pudo establecer queda dicho en la propuesta en vez de
afirmarse, que es lo que el propio recorrido ya instruye. Concederlos es una decisión propia y se toma
cuando una corrida real muestre que hace falta, no de paso.
