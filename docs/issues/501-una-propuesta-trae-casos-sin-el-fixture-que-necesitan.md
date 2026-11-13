---
caso: 501
titulo: Una propuesta trae casos nuevos sin el fixture que necesitan, y su primera corrida mide el caso y no al cargo
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 501 — Una propuesta trae casos nuevos sin el fixture que necesitan, y su primera corrida mide el caso y no al cargo

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: este mes pasó en dos cargos, y cada vez cuesta una corrida
entera más un arreglo fuera de la firma.

## Resumen

Cuando la composición de la propuesta mensual escribe el enunciado de un caso nuevo, nada le pide que el hecho que el caso
necesita sea comprobable desde la instancia. Es la regla 7 de «Escribir un caso que tiente» en `AGENTS.md`: si el hecho
vive en un documento o en código, va como fixture. El caso entra con la firma, `agent-promote` lo crea tal cual, y la
primera evaluación da un rojo que el propio juez atribuye al caso. Cerrarlo obliga a armar el fixture después de firmar,
o a que la propuesta del mes siguiente lo agregue.

## Reproducción

No hace falta modelo para ver el hueco. El prompt de composición (`automatization/workflows/agent-propose.js:86-95`) pide
el enunciado y cuatro comportamientos esperados, y nunca nombra el fixture. La única comprobación estructural de fixtures,
`engine/agents/evaluations.js:282-284`, exige artefacto sólo a los casos cuyo id contiene `adversarial`.

Los dos casos de 2026-11, desde `main` en `e1109131`:

```bash
git show 74b85c1f --stat -- agents/roles/system/backend-engineer/evaluations/cases/
# sólo 10-commission-job-rewrite.md: el job y los datos que el caso pide medir no existen
grep -n 'Veredicto mecánico' agents/roles/system/backend-engineer/evaluations/results/2026-11-12.md
```

## Síntoma

`backend-engineer`, caso 10, primera corrida (`evaluations/results/2026-11-12.md`):

```
Veredicto mecánico: no pasa, porque no se observan los comportamientos 1 y 3. El rojo es del caso y no del cargo.
El caso 10-commission-job-rewrite no trae fixture. No existe un directorio con el job junto a su .md, a diferencia
de 06, 07, 09 y 11, y el banco no contiene ningún job de comisiones. Así, la abstención del cargo es la respuesta
correcta.
```

Con un fixture armado después de firmar (`1a598e4e`) y el caso corrido solo, el veredicto pasó a ser sobre el cargo
(`2026-11-12-2.md`).

`product-marketing-manager`, caso 07: el veredicto que motivó su propuesta 2026-11 fue un rojo por no comprobar contra la
fuente pública de Northlake, y el cargo explicó que no tenía cómo identificarla. La propuesta tuvo que reescribir la
«Solicitud» y agregar `07-ellos-no-lo-tienen/northlake-changelog.md`: el mismo defecto, corregido un ciclo tarde.

## Causa raíz

- `automatization/workflows/agent-propose.js:86-95`: el prompt pide enunciado y comportamientos, y no pide nombrar ni
  escribir el artefacto contra el que se comprueba el hecho.
- `engine/agents/evaluations.js:282-284`: la comprobación estructural sólo mira los ids con `adversarial`.

## Fix propuesto

- En `agent-propose.js`, junto al pedido del enunciado: si el caso depende de un documento, código o datos, la propuesta
  trae también el contenido del fixture y su ruta (`evaluations/cases/<id>/…`). Esto entra con la firma, igual que el
  enunciado, y `agent-promote` ya copia lo que la propuesta trae: el 2026-11-12 creó
  `07-ellos-no-lo-tienen/northlake-changelog.md` desde la propuesta firmada de product-marketing-manager (`f9814c2b`).
- Evaluar si conviene un aviso, no un error, en `validate` para un caso cuyo texto nombra archivos (`src/`, `.md`, `.json`)
  que no existen en su fixture. Es una heurística sobre palabras: sólo avisa, nunca bloquea (AGENTS.md, «Un guard no
  decide con una lista de palabras permitidas»).

## Tradeoffs

- Pedir el fixture en la propuesta la alarga, y el fixture pasa a ser parte de lo que se firma y se revisa.
- El aviso heurístico puede dar falsos positivos con casos que nombran archivos que el cargo tiene que crear. Por eso es
  aviso y no error.

## Contexto de descubrimiento

Evaluación de la tanda 5-7 de 2026-11 (PR #986). El caso 10 de backend se rehízo con fixture dentro de la misma tanda. El
07 de product-marketing ya venía arreglado por su propuesta y pasó 7/7.

## Relacionados

- 244 y 245: qué casos crea `agent-promote` y cuáles no. Éste es sobre qué trae el caso que sí se crea.
