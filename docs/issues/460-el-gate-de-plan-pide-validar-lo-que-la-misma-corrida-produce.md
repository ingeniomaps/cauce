---
caso: 460
titulo: El gate de plan en product-development pide que los dueños validen lo que la misma corrida acaba de producir, y no se puede cumplir en ninguna corrida
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.117.1
---

# 460 — El gate de `plan` pide validar lo que la misma corrida produce

**🟢 resuelto en 0.118.0** · detectado en 0.117.1 · prioridad **media**: `product-development` no puede llegar nunca a la épica
cuando sus dueños son personas, que es el caso normal. Se separó del 458, que lo descubrió.

## Resumen

El exit gate de la etapa `plan` pide que «los equipos dueños validaron estimaciones, capacidad, dependencias y
criterios de integración». El plan lo escribe la misma etapa, en la misma corrida, y quienes tienen que validarlo no
están dentro de ella. Cada corrida produce un plan nuevo que nadie validó todavía, así que el gate frena siempre, y
relanzar con las respuestas de la persona genera otro plan sin validar.

## Reproducción

Corrida real del 458, segunda vuelta (`wf_431dce34-039`, 2026-10-26). La persona ya había contestado D1-D4 y su
capacidad, y esas respuestas iban en la intención. `plan` frenó igual, ahora por el plan nuevo:

```
{"stopped":true,"reason":"gate-no-cumplido","detail":"plan: La persona no validó los rangos, el reparto 6/4, qué se posterga, A1 ampliado ni los criterios de integración. Además falta la fuente y el tope del pago por dato (condición de las cuatro etapas), o la declaración explícita de que este plan cubre sólo el tramo (a)."}
```

No se reprodujo en un banco: la reproducción exige un cargo real que lea el gate, y con el arnés guionado el gate lo
decide el guion.

## Causa raíz

Líneas de la versión detectada.

- `flows/system/product-development/flow.json:92`: el gate de `plan` es una validación posterior a la producción de
  la etapa, no una condición que la etapa pueda establecer con su entrada.
- `automatization/workflows/flow.js:313-321`: cada etapa produce y juzga su propio gate en la misma llamada. No hay un
  estado «producido, esperando validación» que el recorrido sepa retomar.

## Fix propuesto

**Decisión abierta**: es un cambio de contrato del recorrido, que baja a todas las instancias en el próximo
`upgrade`. Hay dos formas, y no se excluyen:

1. **Redactar el gate como lo que la etapa sí puede cumplir**: «el plan explicita estimaciones, capacidad, dependencias
   y criterios de integración, y deja nombrada la validación que falta y de quién». La validación pasa a ser una
   condición (`gate=con-condiciones`) que viaja a las acciones humanas, igual que hoy cualquier `blocking`.
2. **Validar retomando**: con la retoma del 458, la etapa que frenó se vuelve a llamar con las respuestas y su análisis
   anterior como entrada. Trabaja en modo delta, sobre el plan que la persona validó, y no escribe uno nuevo.
   La forma B elegida en el 458 ya le pasa a la etapa que frenó la ruta de su análisis anterior, así que esto llega
   con el 458. Lo que queda acá es comprobar que la etapa trabaje sobre ese plan y no escriba otro.

Se recorren los demás recorridos buscando gates de la misma forma, es decir, que pidan que alguien de afuera apruebe
lo que la etapa produce. Por ejemplo, `release` en este mismo recorrido: «Owners autorizados aceptaron readiness…».
Ése es de entrega y `flow` no lo corre, pero la búsqueda va igual y su resultado entra en el cierre.

## Tradeoffs

- La forma 1 baja la exigencia del texto del gate. La validación no desaparece, pero sale del gate y pasa a la acción
  humana. Si la épica se promueve sin mirarla, nada la frena. Por eso es una quita y se prueba como tal (R29): un caso
  de `flow-eval` donde la validación falta y el resultado tiene que nombrarla.
- La forma 2 depende del 458 y no se puede cerrar antes.

## Contexto de descubrimiento

Salió del 458: el segundo relanzamiento, ya con las respuestas, frenó en el mismo gate por el plan nuevo.

## Relacionados

- 458 — no hay forma de retomar un flow frenado con la respuesta. La forma 2 de este caso la necesita.

## Cierre

**Resuelto en 0.118.0**, con las dos formas.

- **Forma 1, redactar el gate como lo que la etapa puede cumplir.** Se hizo en
  `flows/system/product-development/flow.json`: «Estimaciones, dependencias y criterios de integración están
  explícitos, y la capacidad la declaró por escrito quien la tiene —cuántas horas por semana y durante cuánto
  tiempo—. Si la capacidad no consta, el gate no se cumple, por chico que sea el plan: estimarla o darla por
  alcanzable es suponerla. Que los dueños validen el plan que esta etapa escribió no se puede cumplir dentro de la
  corrida que lo escribe; la validación que falte queda como condición, con quién la da, y no frena». La capacidad sigue frenando a propósito. Las evaluaciones del recorrido
  (`evaluations/results/2026-08-26.md`, `2026-10-16-2.md`) dan por bueno el freno en `plan` cuando no hay dueños ni
  capacidad, y ese freno no se quita.
- **Forma 2, validar retomando.** Llegó con el 458: la etapa que frenó recibe su análisis anterior y las respuestas, y
  parte de ahí.
- **Buscar gates de la misma forma en los demás recorridos.** Se hizo y no hay otro. Se listaron los 36 gates de los
  siete recorridos del sistema:
  - **`change-review/decide`** pide un veredicto «firmado», pero lo firma el cargo de la etapa, no alguien de afuera.
  - **`release` de `product-development`** («Owners autorizados aceptaron readiness…») es de entrega, y `flow` no la
    corre.
  - **El resto** son condiciones que la etapa establece con su entrada.
- **Tradeoff, es una quita.** Se probó con la salida de antes y la de después sobre el mismo caso, como pide R29. En un
  banco instalado se pusieron dos copias de `product-development`, una con cada gate, con la misma retoma sintética
  (cuatro etapas cerradas, frenada en `plan`) y las mismas respuestas: capacidad declarada (3 h por semana durante 6
  semanas), la persona dueña de todo y sin contradicciones con lo establecido.
  - **Gate viejo** (`wf_b1a834c7-17c`): `gate-no-cumplido`, «Que la dueña valide las estimaciones (~8–10 h de 18) y
    los criterios de integración… No hay que relanzar ninguna etapa».
  - **Gate nuevo** (`wf_13ce5ee6-a8b`): `plan` cerró con `con-condiciones` y la corrida siguió a la síntesis, que
    eligió `investigar`. La validación quedó escrita en `planning/human/`: «la dueña del estudio valida o corrige por
    escrito la propuesta…».

  La aserción de ausencia, que el freno por falta de capacidad no se haya ido, también se corrió. Con el gate nuevo y
  sin horas declaradas (`wf_52c7b5c6-691`), `plan` frenó con «Que la dueña declare cuántas horas por semana y durante
  cuántas semanas le puede dedicar». Esa corrida frenó además por una contradicción que traían sus respuestas, así que
  mide el freno de capacidad con ese ruido.
- **Las evaluaciones del recorrido con el gate nuevo.** Se corrieron los cuatro casos de `product-development`
  (`wf_c568e8b2-a02`, 39 agentes, 3,83 M de tokens), con `flow-eval` apuntado al `flow.js` de la rama. Pasaron los
  cuatro, y quedaron en `evaluations/results/2026-10-29.md`. La corrida anterior (`2026-10-16-2.md`) había sido
  parcial, 3 de 3. Los tres casos que llegaron a `plan` frenaron ahí por la razón que el gate nuevo nombra: «Capacidad
  declarada por quien la tiene (… no consta)». O sea, el freno que estas evaluaciones daban por bueno se mantuvo, y
  ahora sale por la capacidad y no por una validación imposible. El cuarto frenó antes, en `frame`. No se agregó un
  caso nuevo: la comparación de arriba ya mide la quita.
- **El primer texto del gate dejaba pasar la falta de capacidad, y se endureció.** Decía «la capacidad la declaró
  quien la tiene: sin eso no hay plan». En una corrida real sin horas declaradas (`wf_f7f1bc9b-467`), `plan` armó un
  plan chico (~1 h de arranque y ~15 min por semana) y dejó la capacidad como pregunta no bloqueante: cerró en
  `con-condiciones`. Con el texto de arriba, la misma retoma y las mismas respuestas (`wf_ff65aba2-2ad`) frenó con
  «Capacidad declarada por escrito por quien la tiene: cuántas horas por semana y durante cuántas semanas…». La
  evaluación de cuatro casos corrió con el primer texto; el endurecimiento sólo exige más en lo que esos tres casos
  ya frenaban, la capacidad, así que no se repitió.
- **Depende del 458.** Se resolvió en la misma versión.

Encontrado y no previsto:

- **En la primera tanda, la respuesta contradecía lo establecido.** Las tres corridas recibieron «Turnito ya manda
  emails de confirmación», que contradecía lo que había dejado `architect`, y las tres frenaron pidiendo relanzar
  `research` y `architect`. Es el freno por contradicción del 458, medido de verdad. Para medir el gate hubo que
  repetir con una respuesta sin contradicción.

**Sin probar:** los cuatro casos de `flow-eval` con el texto final del gate, porque corrieron con el primero; y el freno
por falta de capacidad sin el ruido de una contradicción en las respuestas.
