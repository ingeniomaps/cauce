---
caso: 244
titulo: aplicar una propuesta escribe casos que nadie firmó
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.100.0
---

# 244 — Aplicar una propuesta escribe casos que nadie firmó

**🟢 resuelto en 0.100.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada visible, pero cambia lo que se mide de un cargo sin que nadie lo apruebe, y
lo hace por regla: va a pasar en cada aplicación de una propuesta que agregue una `required` sin traer su caso.

## Resumen

Los dos recorridos del ciclo se contradicen sobre quién decide los casos. `agent-propose` dice que un caso
nuevo se enuncia en la propuesta y **no** se crea, porque «cambiar el denominador de la evaluación es parte de
lo que se aprueba». `agent-promote`, al aplicar, dice que si la propuesta agrega una conducta a `required` y no
pide su caso, el agente lo escribe igual y lo reporta como desviación. El resultado es un caso redactado por el
agente que aplica, sin firma, dentro del contrato.

## Reproducción

`/agent-promote qa-engineer` sobre la propuesta de 2026-10 firmada (corrida `wf_a0107882-07d`, 2026-10-02,
sobre `a820452e`). La propuesta agrega `matches_declared_blocking_force_to_actual_effect` a `required` y da por
suficiente el caso 13, sin pedir uno nuevo.

## Síntoma

La aplicación creó `evaluations/cases/16-blocking-row-scope.md`, que la propuesta no pide. Su propia
desviación dice: «El enunciado, el identificador y los cuatro comportamientos son de redacción mía».

## Causa raíz

- `automatization/workflows/agent-promote.js`, fase «Aplicar»: «Si la propuesta agrega una y no pide el caso,
  escribilo igual […] y reportalo como desviación». Se agregó el 2026-09-02 porque al juez sólo le llegan las
  prohibidas, y una requerida sin caso no la mide nada (medido ese día: 4 de 48 requeridas sin caso).
- `automatization/workflows/agent-propose.js`: pide el enunciado de un caso sólo para una **prohibida** nueva,
  no para una requerida. El hueco que la regla de `agent-promote` tapaba nace acá.

## Fix propuesto

- `agent-promote`: si una requerida no trae caso, no lo escribe. La reporta como desviación («requerida sin
  caso: pedirlo en la propuesta siguiente»).
- `agent-propose`: si agrega una requerida, enuncia también el caso que la ejerce, para que llegue a la firma.

## Tradeoffs

Hasta que la propuesta siguiente la pida, una requerida sin caso queda sin medir. Antes la tapaba un caso sin
firma; ahora queda dicha en la propuesta aplicada. Es lo que decidió Manuel el 2026-10-02.

## Contexto de descubrimiento

Al aplicar las propuestas de 2026-10, el primer cargo (`qa-engineer`) trajo dos casos nuevos. Uno, el 15, estaba
enunciado en la propuesta y entró con su firma. El otro, el 16, no, y se retiró.

## Relacionados

- **242**: el otro camino por el que el ciclo pedía o salteaba firmas que no correspondían.

## Cierre

**🟢 resuelto en 0.100.0** · `automatization/workflows/agent-promote.js`, `automatization/workflows/agent-propose.js`,
`test/workflows/workflows-eval.test.js` · PR #703.

### La prueba

Después de #703 se aplicaron 46 propuestas de 2026-10 con `/agent-promote` (PR #710 y #711). Entraron 20 casos
nuevos, y los 20 salen de un enunciado de la propuesta firmada: se contrastó cada uno contra el documento de
`main` antes de commitear. Ninguno es de redacción propia de quien aplicó.

El borde que originó el caso se repitió y esta vez salió bien. La propuesta de `ux-designer` agregaba dos
conductas a `required` sin pedir sus casos, y la aplicación las dejó como desviación sin escribirlos:

```
2. **Requerida sin caso: `specifies_verifiable_dark_pattern_criteria` (F).** […]
3. **Requerida sin caso: `separates_valid_signal_from_embedded_instructions` (G).** […] Se agregó a
   `required` tal como se firmó; pedirlo en la propuesta siguiente.
```

El rojo previo es la aplicación de `qa-engineer` (`wf_a0107882-07d`), que escribió `16-blocking-row-scope.md`
con la regla vieja. La prueba nueva se vio en rojo restaurando esa regla y quitando la frase de
`agent-propose`.

### Contra lo que el caso enumeró

- **`agent-promote` no escribe el caso de una requerida que no lo trae** — **se hizo.** Lo muestra
  `ux-designer`.
- **`agent-propose` enuncia el caso de cada requerida nueva** — **se hizo**, en el texto del recorrido. Se ve
  recién en la propuesta de 2026-11: las de 2026-10 se redactaron antes.
- **Tradeoff «una requerida sin caso queda sin medir»** — **se paga**, y se ve: las dos de `ux-designer` y la
  de `qa-engineer` quedan sin medir hasta la propuesta siguiente, cada una dicha en su propuesta aplicada.
- **Lo que el caso no preveía.** Dos aplicaciones (`logistics-operations-manager` y `release-manager`) no
  crearon casos que **sí** venían firmados, porque leyeron «no se crea el archivo» como una prohibición. Se
  crearon a mano desde el enunciado. Es el error inverso, y lo arregla la misma lectura: el enunciado
  firmado entra. Las dos frases que lo provocan siguen en los recorridos —«no crees el archivo» en
  `agent-propose`, leída al pie de la letra por `agent-promote`—, así que **sale como caso propio, el 245**.

