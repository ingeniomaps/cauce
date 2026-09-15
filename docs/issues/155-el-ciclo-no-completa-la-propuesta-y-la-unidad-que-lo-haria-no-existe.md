---
caso: 155
titulo: El ciclo deja la propuesta mensual en «por definir» y el paso que la completaría lo difieren dos casos sin abrir ninguna unidad
estado: abierto
prioridad: media
version-detectada: 0.90.0
---

# 155 — El paso que completa el ciclo lo difieren dos cierres y nadie lo tiene

**🔴 abierto** · detectado en 0.90.0 · prioridad **media** — el recorrido que falta ya existe y está
escrito; lo que no existe es la unidad que decida conectarlo

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
