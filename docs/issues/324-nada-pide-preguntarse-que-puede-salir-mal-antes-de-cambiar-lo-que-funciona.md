---
caso: 324
titulo: nada pide preguntarse qué puede salir mal antes de cambiar lo que funciona
estado: resuelto
resuelto-en: 0.104.0
prioridad: alta
version-detectada: 0.103.5
---

# 324 — Las reglas que recibe una empresa no tienen una sobre regresiones

**🟢 resuelto en 0.104.0** · detectado en 0.103.5 · prioridad **alta**.

**Prioridad alta**: es la falta que produjo la 0.103.4, y la tienen todas las instancias.

## Resumen

Las reglas del sistema dicen cómo probar lo que se agrega y cómo probar una quita. Ninguna pide, antes de
cambiar algo que funciona, escribir qué podría salir mal, ni comparar el antes con el después.

## Lo que hay y lo que falta

- **Hay**: R9 pide una aserción de ausencia para una quita; R3 pide buscar fallos antes de verificar. En los
  cargos, «regresión» aparece como tarea de QA.
- **Falta**: tratar como quita el cambio de **quién** o **cómo** se hace algo; guardar una salida de antes
  para compararla; y que la lista de riesgos decida **si** se hace, no sólo cómo.

## El caso que lo muestra

La 0.103.4 cambió qué agente escribía la entrada de `done/`. Se comprobó que el archivo existiera y pasara
`check`. No se comparó contra una entrada del agente anterior, y salió publicada copiando el relato de Build
(caso 301). En la versión siguiente se escribió antes qué podía salir mal y se pidió una revisión
independiente del diff: dos veces encontró defectos serios antes de publicar.

## Fix propuesto

Una regla nueva del sistema, corta, con tres exigencias:

1. **Antes de tocar algo que funciona se escribe qué podría salir mal**, y para cada cosa qué la evita o cómo
   se vería si pasa. Si no se puede contestar, no se sabe lo suficiente para cambiarlo.
2. **Cambiar quién o cómo se hace algo es una quita**: se guarda la salida de antes y se compara con la de
   después, sobre el mismo caso.
3. **Esa lista decide si se hace.** Un cambio cuyo riesgo no se puede cubrir se deja.

Y que el recorrido la aplique donde ya critica el plan: la crítica pregunta «qué deja de pasar» además de «si
el plan cumple».

## Por qué hacerlo

Es la disciplina que evitó tres regresiones esta semana, y hoy vive sólo en una conversación.

## Riesgos y regresiones

- **Baja a todas las empresas en su próximo `upgrade`.** No es una decisión de estilo.
- **Más ceremonia en cada tarea**, también en las que no la necesitan. Hay que acotarla a lo que **cambia**
  algo que ya funciona; una función nueva no tiene «antes».
- **Una regla más que cargar**: unos cientos de tokens por agente.
- **Que se cumpla como trámite**: una lista de riesgos genérica, igual en todas las tareas. Se mide con casos
  de evaluación, no con el texto.

## Qué habría que probar

- Casos de evaluación de la forma incidental: una tarea que reemplaza algo que funciona, sin nombrar la regla.
- El peso de las reglas, que tiene su propia puerta.

## Recomendación

**Hacerlo**, redactada y vista por el dueño antes de sumarla, y medida con evaluaciones antes de publicarla.

## Relacionados

- R9, R3 y R15.
- 301 — la regresión que la motiva.

## Cierre

**Resuelto en 0.104.0**, con mucho menos de lo propuesto: un párrafo en R9 y ninguna regla nueva.

### El recorrido de lo que este caso enumeró

- **1. «Antes de tocar algo que funciona se escribe qué podría salir mal» — se decidió que no.** En la tanda
  de 0.103.6 la lista de riesgos fue lo que menos acertó: cuatro casos decían «riesgo bajo» y la revisión
  independiente encontró en cada uno un defecto que impedía entregar. Lo que los encontró fue comparar contra
  la línea de base y que otro mirara el diff. Una regla que pide la lista pide la parte que no funcionó.
- **2. «Cambiar quién o cómo se hace algo es una quita» — se hizo**, como un párrafo en R9, donde ya vive la
  quita. Dice que la igualdad se sostiene con la salida de antes y la de después sobre el mismo caso, y que
  esa comparación va en la aceptación como condición.
- **3. «Esa lista decide si se hace» — se decidió que no**, por lo mismo que el 1.
- **Que la crítica del recorrido pregunte «qué deja de pasar» — no se hizo.** El párrafo ya llega a quien
  critica el plan, por las reglas que carga; cambiar el prompt de una fase es otra quita y no hizo falta.
- **«Baja a todas las empresas» — se pagó**: está en el changelog de 0.104.0.
- **«Más ceremonia en cada tarea» — se acotó**: el párrafo habla sólo de mover o reemplazar algo que ya anda.
- **«Una regla más que cargar» — se midió**: el bloque pasa de 51 a 52,3 KB por agente.
- **«Que se cumpla como trámite» — se midió con evaluaciones**, abajo.
- **Casos de evaluación de la forma incidental — se hicieron**: `09-export-rewrite` y
  `09-invoice-moves-to-a-worker`. Ninguno nombra la conducta.
- **El peso de las reglas — se midió**: su prueba se puso roja al agregar el párrafo y se actualizó con la razón.

### Lo que este caso encontró y no preveía

**No hacía falta para todos.** El cargo que construye ya lo hacía solo: antes de reescribir fijó el formato
actual y comparó la salida vieja con la nueva. El que no lo hacía era el que aprueba un plan: veía lo que la
mudanza perdía, y aun así dejaba «es el mismo» como supuesto en vez de pedir la prueba.

### Qué se corrió

Cuatro corridas de `agent-eval`, cada una filtrada a un caso, en sesiones nuevas:

| Cargo y caso | Con R9 como estaba | Con el párrafo |
|---|---|---|
| `backend-engineer` · `09-export-rewrite` | pasa | — |
| `software-architect` · `09-invoice-moves-to-a-worker` | no pasa, dos veces, por el mismo comportamiento | pasa |

- **Las dos que fallaron** no volvieron la comparación una condición de aceptación. La primera quedó marcada:
  otra sesión editó el motor mientras corría. La segunda corrió con el repositorio quieto y dio lo mismo.
- **La que pasó** cita la regla —«mover un paso de lugar es una quita (R9)»— y pone en la aceptación que, sobre
  un mismo pedido, la ruta de antes y la nueva produzcan el mismo PDF, lado a lado.
- **Lo que esto no prueba**: es una sola corrida con el párrafo. Dos rojos seguidos y un verde que cita la
  regla es una señal fuerte y no una medida de cuánto varía; se va a ver en el ensamblaje mensual, que corre
  los casos de cada cargo.
- **La puerta entera**, `npm run ci`.
