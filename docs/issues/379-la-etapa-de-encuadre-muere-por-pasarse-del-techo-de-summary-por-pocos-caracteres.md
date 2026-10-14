---
caso: 379
titulo: la etapa de encuadre muere por pasarse del techo de summary por pocos caracteres
estado: abierto
prioridad: media
version-detectada: 0.107.0
---

# 379 — Una etapa de `flow` devuelve `summary` apenas por encima de los 1000 caracteres, cinco veces seguidas, y el recorrido muere sin resultado

**🔴 abierto** · detectado en 0.107.0 · prioridad **media** — con una intención completa, `feasibility-review` no pasa
de su primera etapa, y lo que lo mata es un exceso de 1 a 15 caracteres sobre un techo que el prompt ya nombra.

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
