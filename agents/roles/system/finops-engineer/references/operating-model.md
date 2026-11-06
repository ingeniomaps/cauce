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
- La tarifa de Anthropic no es una sola: en Claude 4.6 y modelos posteriores, `inference_geo: "us"` en
  la Claude API, en Claude Platform on AWS y en Claude Models on Google Cloud (Anthropic managed), y el
  tipo de despliegue "US Data Zone Standard" en Microsoft Foundry, aplican un multiplicador de 1.1x
  (los modelos anteriores no aceptan el parámetro) sobre todas las categorías de tokens — también
  dentro de una sesión de Claude Managed Agents. Bedrock y Claude Models on Google Cloud (Google
  managed) quedan afuera, con tarifa regional independiente. Facturado por AWS Marketplace o Azure
  Marketplace, el cargo llega como una sola línea de Claude Consumption Units (CCU). En Claude
  Platform on AWS el desglose está en la Claude Console; para Microsoft Foundry la página sólo dice
  que Azure Cost Management muestra el CCU agregado.
- El multiplicador de acierto de caché no es uniforme entre modelos: 0.1x estándar, salvo 0.025x en
  Claude Fable 5.1/Mythos 5.1 y 0.05x en Claude Opus 5.5 y en Claude Sonnet 5.5. Estimar el ahorro de
  caché de estos tres modelos con el 0.1x estándar subestima el ahorro real.
- Estos dos multiplicadores están **Verificados** contra `platform.claude.com/docs/en/about-claude/pricing`
  al 2026-10-24 (secciones "Data residency pricing", "Inference geography" de Claude Platform on AWS y
  de Microsoft Foundry, "Claude Managed Agents pricing", "Prompt caching" y la tabla "Model pricing" con
  sus notas 1 y 2 — H1 y H5 del informe del 2026-10-24). El propio ciclo semanal corrigió una vez el
  multiplicador de caché de Sonnet 5.5 entre dos corridas del mismo mes: re-verificar contra esa página
  antes de usar estos números en una estimación, no darlos por ciertos de memoria (R14).
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
