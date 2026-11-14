---
caso: 501
titulo: Una propuesta trae casos nuevos sin el fixture que necesitan, y su primera corrida mide el caso y no al cargo
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 501 — Una propuesta trae casos nuevos sin el fixture que necesitan, y su primera corrida mide el caso y no al cargo

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: este mes pasó en dos cargos, y cada vez cuesta una corrida
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

## Cierre

Los dos extremos del recorrido piden el fixture:

- `agent-propose`, junto al pedido del enunciado de un caso nuevo: si el hecho que el caso necesita vive en un
  documento, código o datos, copia dentro de la propuesta la ruta (`evaluations/cases/<id>/<archivo>`) y el contenido
  completo del archivo, sin crearlo.
- `agent-promote`, junto a la orden de crear el caso: crea tal cual los archivos que la propuesta trae para el caso, y
  si el caso los necesita y no vienen, no los inventa y lo deja como desviación («caso sin fixture: pedirlo en la
  propuesta siguiente»).

Línea de base: la prueba nueva en rojo sobre los dos prompts de `HEAD`, porque ninguno nombraba el fixture. Y lo que
pasó con el prompt anterior está en la historia: `74b85c1f` creó `backend-engineer/10` sin fixture y sin decir nada.

Contra el caso:

- **Fix 1, pedir el fixture en `agent-propose`:** se hizo, y además en `agent-promote`. El caso daba por hecho que
  `agent-promote` «ya copia lo que la propuesta trae», citando `f9814c2b`. Es cierto para lo que viene en «Cambio
  propuesto», que es donde venía el changelog de Northlake. Pero el enunciado de un caso nuevo va en «Evaluación», y la
  orden de crear el caso (`agent-promote.js:156-160`) no nombraba el fixture. Sin tocar `agent-promote`, el fixture
  podía quedar escrito en la propuesta sin que nadie lo creara.
- **Fix 2, evaluar un aviso en `validate`:** se evaluó y se decidió que no. Sobre los 425 casos del catálogo, un
  barrido de los nombres de archivo entre backticks que no están en el fixture del caso marcó 8, y 7 eran falsos
  positivos: `SKILL.md` o `sources.yaml`, que son del propio cargo. Y el caso que originó éste, `backend-engineer/10`
  tal como se firmó, no nombra ningún archivo: habla de «el job» y de la tabla `ventas`. El aviso no lo habría visto.
- **Tradeoff, la propuesta se alarga y el fixture se firma:** se acepta. Lo que se firma, en cambio, no cubre el
  fixture: la huella del caso 486 sella sólo «Cambio propuesto». Sale como caso propio (abajo).
- **Tradeoff, falsos positivos del aviso:** no aplica, porque el aviso no se hizo.

Lo que el caso no preveía:

- **La firma no cubre el fixture, y tampoco todo «Cambio propuesto».** La revisión independiente encontró dos huecos de
  la huella del 486, anteriores a este cambio. Uno: «Evaluación», donde van el enunciado del caso nuevo y ahora su
  fixture, no está en la huella. Dos: la huella se corta en el primer `## ` aunque esté dentro de un bloque de código.
  Medido sobre `product-marketing-manager/learning/proposals/2026-11.md`: editar la línea 498, dentro del changelog de
  Northlake, deja la huella igual, y editar la 451 la cambia. Los dos son el mismo defecto, y salen juntos como el
  caso 505.
- **Ninguna prueba ejecutaba los prompts de estos dos workflows.** Un `+` que falte entre dos líneas del texto deja un
  template etiquetado que es JavaScript válido, pasa toda la suite y revienta recién al correr. Se vio con una mutación
  sobre la primera versión. El arnés del scratchpad que corre el workflow con un `agent()` falso lo atrapa («… is not a
  function»). Queda anotado: no es de este caso.

### Lista de cierre

1. hecho: la prueba nueva en rojo contra los prompts de `HEAD`, y el precedente en `74b85c1f`.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: `workflows-eval.test.js` en rojo antes del cambio («la redacción nombra dónde va el fixture») y en verde
   después.
4. hecho: cuatro mutaciones, todas en rojo: sacar la ruta `evaluations/cases/<id>/` de `agent-propose`, cambiar
   «contenido completo» por «lo que contiene», sacar «archivos para el caso» de `agent-promote`, y sacar «caso sin
   fixture». La prueba busca palabras: si se invierte el sentido sin tocarlas, pasa. Ése lo cubren las corridas reales.
5. no aplica: no se quita ni se reemplaza nada. Los dos prompts suman una instrucción.
6. hecho: los prompts reales, sacados del workflow renderizado y corrido con un `agent()` falso, ejecutados con
   `claude -p` y Sonnet en un banco con `backend-engineer` como estaba en noviembre. Componer, con la propuesta de
   noviembre devuelta a «por definir» y la conducta requerida ya decidida: escribió el caso 10 y, en «Evaluación», tres
   archivos con su ruta y su contenido completo, sin crearlos en disco. Extraídos, su prueba pasa. Aplicar, con la
   propuesta firmada de noviembre tal cual: creó el caso sin inventar el job y escribió la desviación «Caso sin
   fixture». Aplicar, con esa misma propuesta más un fixture: lo creó idéntico byte a byte (742 bytes).
7. hecho: lo que depende de un modelo corrió con un modelo, arriba. Cinco corridas, USD 1,75.
8. hecho: los dos lados del pedido en aplicar, con y sin fixture. Componer corrió tres veces. La primera, sin la
   decisión de agregar una requerida, no propuso caso nuevo, así que no ejercitó el pedido. La segunda y la tercera
   escribieron el fixture; la tercera es sobre el texto final, después de la revisión. No corrió dentro de
   `agent-learning.yml` en GitHub, ni con el modelo que use ese workflow.
9. no aplica: no coordina nada.
10. hecho: `agent-learning.yml` corre `/agent-propose` y sólo lee «Cambio propuesto» para saber si quedó en blanco.
    `sign-proposal.yml` y la huella leen «Cambio propuesto» y «Aprobación humana». Nadie parsea «Evaluación».
11. hecho: dos pasadas independientes. La primera no encontró nada que impidiera entregar. Señaló que el pedido se
    podía leer como crear el archivo en disco, y que la prueba y un comentario afirmaban de más: los tres se
    corrigieron. Encontró además los dos huecos de la huella (caso 505). La segunda, sobre esos retoques, no encontró
    nada que impidiera entregar ni contradicciones dentro del prompt.
12. hecho: pasada uno por uno sobre los dos comentarios nuevos y el de la prueba. Se corrigió «pasó dos veces»: desde
    una propuesta pasó una vez, porque el caso 07 de product-marketing lo creó una persona en 2026-08.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG.

**Sin probar:** el recorrido dentro de `agent-learning.yml` en GitHub, con su modelo, y una composición que decida sola
agregar un caso, sin la decisión ya escrita en los hallazgos.
