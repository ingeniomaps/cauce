# Modelo operativo de FinOps

## Contrato de costo

Toda cifra de costo se entrega con cuatro elementos, o no se entrega:

- **Unidad**: por request, usuario activo, tarea procesada o tenant. La unidad la define el negocio, no
  la herramienta de facturación.
- **Ventana**: el período medido, constante entre comparaciones. Comparar un mes de 28 días contra uno
  de 31 produce ahorros imaginarios.
- **Cobertura de atribución**: qué porcentaje del gasto tiene dueño identificado. Reportarlo siempre: el
  gasto sin atribuir es el que nadie optimiza y suele ser donde está el problema.
- **Naturaleza**: fijo o variable, comprometido o bajo demanda. Un ahorro propuesto sobre capacidad ya
  comprometida no es un ahorro.

## Investigación de un salto

En orden, antes de proponer cualquier cambio:

1. Aislar el componente y la fecha exacta del cambio.
2. Descomponer en precio × cantidad. Un aumento de tarifa y uno de volumen piden respuestas opuestas.
3. Descartar causas de producto: una regresión que duplica llamadas se arregla en el código, no
   comprando capacidad.
4. Verificar entornos no productivos, recursos huérfanos y trabajos que quedaron corriendo.

Atribuir un salto a "más uso" sin descomponerlo es la forma más común de financiar un bug.

## Modelo de costo de IA

El gasto en modelos no escala con usuarios sino con contexto y reintentos:

- Separar tokens de entrada y de salida: tienen tarifas distintas y se optimizan distinto.
- El contexto arrastrado domina el costo en sistemas con agentes. Un preámbulo que se repite en cada
  llamada se multiplica por la cantidad de llamadas, no por la de usuarios.
- Contabilizar reintentos, herramientas fallidas y respuestas descartadas: se pagan igual.
- El caché cambia la economía sólo si la tasa de acierto es real y medida, no supuesta.
- Al comparar modelos, comparar costo por tarea completada con calidad aceptable, no precio por token.

## Optimización

Cada opción se presenta con ahorro esperado, riesgo, esfuerzo y **qué se degrada**:

- Estimar con el uso observado, nunca con el máximo teórico de la calculadora del proveedor.
- Una optimización que reduce fiabilidad, retención exigida o postura de seguridad requiere que el dueño
  de ese dominio la acepte por escrito.
- Preferir cambios reversibles y medibles antes que reestructuraciones grandes.
- Cerrar el ciclo: comparar el ahorro observado contra el estimado y registrar la diferencia. Sin esa
  comparación las estimaciones no mejoran nunca.

## Presupuestos y alertas

- Cada presupuesto tiene dueño, umbral y acción asociada. Sin acción definida, la alerta enseña a
  ignorar alertas.
- Alertar sobre tasa de cambio, no sólo sobre acumulado: un salto se detecta en horas, un acumulado
  avisa cuando ya se gastó.
- Distinguir alerta de anomalía de alerta de presupuesto: la primera es técnica, la segunda es de
  negocio y las atiende gente distinta.

## Control de calidad

Antes de entregar, verificar que hay unidad, ventana, baseline y cobertura de atribución; que el ahorro
se estimó con uso real; que está explícito qué se degrada y quién debe aceptarlo; que ninguna acción
sobre producción se ejecuta sin autorización; y que las cifras por cliente o de contratos sólo se
comparten con quien corresponde.

## Fundamento externo

Las tarifas se toman de la documentación oficial de precios de cada proveedor, con fecha y región,
porque cambian sin aviso. Las calculadoras de ahorro y los estudios de retorno publicados por
proveedores son material comercial y no sustituyen la medición propia.
