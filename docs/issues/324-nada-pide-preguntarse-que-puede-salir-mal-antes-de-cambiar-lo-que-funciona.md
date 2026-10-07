---
caso: 324
titulo: nada pide preguntarse qué puede salir mal antes de cambiar lo que funciona
estado: abierto
prioridad: alta
version-detectada: 0.103.5
---

# 324 — Las reglas que recibe una empresa no tienen una sobre regresiones

**🔴 abierto** · detectado en 0.103.5 · prioridad **alta**.

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
