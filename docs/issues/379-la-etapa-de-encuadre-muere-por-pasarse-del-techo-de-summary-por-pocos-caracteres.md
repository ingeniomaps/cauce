---
caso: 379
titulo: la etapa de encuadre muere por pasarse del techo de summary por pocos caracteres
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.107.0
---

# 379 — Una etapa de `flow` devuelve `summary` apenas por encima de los 1000 caracteres, cinco veces seguidas, y el recorrido muere sin resultado

**🟢 resuelto en 0.108.0** · detectado en 0.107.0 · prioridad **media** — el prompt pide 800 y el esquema admite 1000;
con la misma intención que mató dos veces el encuadre, las tres etapas pasaron con 957, 834 y 750 caracteres.

## Resumen

El esquema de una etapa fija `summary` en `maxLength: 1000`, y el prompt de la etapa se lo dice al agente con el
número («summary 1000 caracteres»). Aun así, con una intención rica —problema, usuario, resultado, mecanismo actual y
quién decide, unas 900 letras— la etapa `frame` de `feasibility-review` devolvió un `summary` de 1001 caracteres, y
en los cinco reintentos no bajó: la reanudación de la misma corrida dio 1015. El runtime agota el tope de reintentos
y el recorrido termina en `stage-unavailable` sin un solo resultado, con el manifiesto ya pagado.

El comentario junto al esquema (`automatization/workflows/flow.js`, sobre `summary`) describe el fenómeno inverso
—un techo por debajo de lo que el prompt pide contradice, y el agente converge hacia abajo sin llegar— y fija el
número en lo que el prompt pedía. Acá el prompt y el techo coinciden, y lo que falla es otra cosa: el modelo no
cuenta caracteres con precisión, y un techo pedido al límite se cruza por el margen de ese conteo.

## Reproducción

Banco `sidecar` con la empresa y los dominios completados y un `app` con autenticación por tabla de sesiones.
Corrida real de `flow.js` renderizado con `make eval-workflows`, desde esta sesión, `flow: feasibility-review`:

- Corrida `wf_8faf6558-ccb`, intención de ~700 letras: las tres etapas pasan; `frame` devolvió `summary` dentro
  del techo. Termina en `investigar`, correcto para ese banco.
- Corrida `wf_e1417681-04d`, intención de ~900 letras sobre el mismo banco: `frame` falla con
  `StructuredOutput retry cap (5) exceeded … /summary: must NOT have more than 1000 characters (got 1001)`.
- Reanudación de la misma corrida (`resumeFromRunId`): el manifiesto se reusa y `frame` vuelve a fallar con
  `got 1015`, cinco reintentos.

Costo: 204 119 y 120 007 tokens respectivamente, sin resultado. Verificado el 2026-10-14 en este repositorio.

## Fix propuesto

Pedir en el prompt menos de lo que el esquema admite —por ejemplo «hasta 800 caracteres; el esquema admite 1000»—
para que el margen de conteo del modelo caiga adentro del techo y no afuera. Es lo contrario de bajar el techo,
que es lo que el comentario de `flow.js` midió que no funciona: el esquema se queda en 1000 y lo que baja es el
pedido. Medir con la misma intención de ~900 letras sobre el mismo banco: lo refuta que `frame` vuelva a pasarse.

Lo que no conviene: subir el techo. El comentario registra por qué un `summary` largo mata la respuesta entera
más adelante —el modelo envuelve el JSON como string—, y 1000 ya es del orden de lo que una etapa posterior
necesita para decidir (R16).

## Tradeoffs

- Pedir 800 acorta lo que viaja entre etapas; lo que no entra sigue en el archivo de análisis, que es donde R16 lo
  quiere.
- Un prompt que pide un número distinto del esquema pide explicar por qué, junto al esquema, o alguien lo
  «corrige» igualándolos.

## Cierre

**Resuelto en 0.108.0.** El prompt de cada etapa pide menos de lo que el esquema admite —`summary` hasta 800
caracteres con el techo de 1000 a la vista, `missing` y `humanAction` hasta 400 de 500, cada evidencia hasta 160
de 200— y dice por qué: el conteo del modelo no es exacto. El esquema no cambió.

**Lo que se corrió para saber que funciona.** La misma corrida que falló dos veces —`feasibility-review`, el
mismo banco `sidecar` con la línea `admin`, la misma intención de ~900 letras— se lanzó el 2026-10-14 con el
recorrido renderizado desde esta rama (`wf_bf99a979-602`). Las tres etapas pasaron con `summary` de 957, 834 y 750
caracteres: una por encima de los 800 pedidos y las tres por debajo del techo, que es exactamente lo que el
margen buscaba. Ocho agentes, 807 819 tokens, y el recorrido llegó al final y escribió
`epic-001-cierre-de-sesiones-desde-consola-de-soporte.md`, lo que ninguna de las tres corridas anteriores había
conseguido. `test/flows/flow.test.js` fija el pedido por debajo del techo; `workflows.test.js` sigue fijando que
ningún campo del esquema quede sin tope.

**Lo que el caso no preveía.** La corrida midió de paso lo que el 0.108.0 dejaba sin medir: el Draft escribió
`## Hitos` con la forma pedida —tres hitos, cada historia en uno solo, `(line: admin)` en los tres y ninguna
línea inventada—, `check` lo aceptó, y después de resolver a mano un `Por definir` de Riesgos, `promote` escribió
tres `backlog/<hito>.md` con `line: admin`, `join` los trajo a la línea y `context` desde `admin` ofreció la
primera tarea de su primer hito mientras el principal siguió viendo sólo el suyo.

**Recorrido de lo que el caso enumeraba.**

- **Pedir menos de lo que el esquema admite — se hizo**, en los tres campos con tope y no sólo en `summary`.
- **No subir el techo — se conserva**: 1000 sigue siendo el techo y el comentario del esquema sigue vigente.
- **Tradeoff, viaja menos entre etapas — aceptado**: lo que no entra queda en el archivo de análisis.
- **Tradeoff, un pedido distinto del esquema pide explicarse — se hizo**: el porqué está junto al prompt.
