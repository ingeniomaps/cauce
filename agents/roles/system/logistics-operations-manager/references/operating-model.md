# Modelo operativo de la cola de excepciones

## Contrato de gestión de cola

```markdown
Corte: países, transportadoras, ventana y volumen
Capacidad: personas, turnos y horas disponibles en la ventana
Mezcla: tipos de excepción y su peso en el volumen
Desbloqueo: quién puede resolver cada grupo
Prioridad: criterio aplicado y qué queda deliberadamente sin atender
Automatizable: qué desenlace es único y verificable
Compromisos: qué se comunica, a quién, con qué texto y con qué registro
Evidencia: qué se tiene por caso y qué falta pedir
Escalaciones: qué sale al proveedor logístico y con qué disparador
Indicadores: antigüedad, entrante contra atendido, reincidencia
Decisiones pedidas: cuál, a quién y hasta cuándo sirve
```

## Clasificar por desbloqueo, no por síntoma

El tipo que reporta la transportadora describe el síntoma; lo que decide el trabajo es quién tiene la
llave. Cuatro grupos, y cada uno tiene un dueño distinto:

- **Dato del cliente final**: dirección incompleta o errada, teléfono inválido, destinatario ausente sin
  franja acordada. Lo desbloquea un dato que hoy no está, y la ventana para conseguirlo es corta.
- **Decisión del vendedor**: autorizar devolución, autorizar reprogramación con costo, cambiar la
  dirección de entrega. Lo desbloquea una persona identificable a la que hay que llegar con la pregunta
  cerrada, no con el caso entero.
- **Acción de la transportadora**: reintento, reasignación de ruta, búsqueda de un objeto extraviado,
  soporte de entrega. Lo desbloquea el tercero y sólo se puede pedir, con evidencia y por el canal del
  acuerdo.
- **Sin desbloqueo posible**: envío en estado terminal, evento fuera de ventana, evento informativo. Sale
  de la cola por regla, no por criterio.

Un grupo mal asignado es la causa más barata de una cola inflada: casos que esperan a alguien que nunca
iba a poder resolverlos.

## Priorizar cuando hay más excepciones que gente

El orden de llegada es el peor criterio disponible: trata igual a lo que vence hoy y a lo que aguanta una
semana. Priorizar por **lo que se pierde si no se toca**, en este orden:

1. **Irreversible con plazo corto**: la ventana de reintento que vence, el objeto que pasa a devolución
   automática, el plazo de reclamación ante la transportadora, la excepción cuyo desenlace por omisión es
   el caro.
2. **Reversible pero caro de revertir**: la devolución que todavía se puede convertir en entrega.
3. **Impacto agregado**: el tipo que afecta a muchos envíos a la vez —una ruta caída, una ciudad sin
   cobertura, una integración que dejó de reportar— y que se resuelve una vez para todos.
4. **El resto**, por antigüedad.

Lo que queda sin atender se declara, no se omite: una cola priorizada tiene una parte que a propósito no
se trabaja, y esconderla es lo que impide pedir gente con evidencia.

Con la capacidad como límite, el número que gobierna es cuánto entra por día contra cuánto se puede
atender por día. Si el entrante supera sostenidamente al atendido, ninguna priorización lo arregla: el
resultado del análisis es una decisión de capacidad o de automatización, y se entrega como tal.

## Qué se automatiza y qué necesita una persona

Automatizable cuando las tres se cumplen a la vez:

- el desenlace es **único**: dado el evento, sólo hay una acción correcta;
- es **verificable**: existe un evento posterior que confirma que la acción ocurrió;
- es **reversible o inocuo** si la clasificación estuvo mal.

Necesita una persona cuando hay que interpretar un texto libre de la transportadora, elegir entre dos
desenlaces con costos distintos, hablar con el cliente final o comprometer algo. El cierre automático
apoyado en un evento ambiguo es el caso peligroso: convierte una excepción abierta —visible, contable— en
un caso perdido, y el indicador mejora justo cuando la operación empeora.

## Qué se le promete a quién

| A quién | Se puede | No se puede |
|---|---|---|
| Cliente final | Qué reportó la transportadora, con fecha y origen; qué se pidió; cuándo se vuelve a mirar | Fecha de entrega, ventana de reintento, compensación |
| Vendedor | Qué falta para desbloquear, hasta cuándo sirve, qué pasa por omisión | Resultado de la gestión, crédito, condonación de flete |
| Transportadora | Reclamación con evidencia y plazo del acuerdo | Aceptar su versión sin soporte, ni cerrar en su sistema |
| Adentro | Estado, evidencia, riesgo y decisión pedida | Dar por hecho lo que depende de un tercero |

La frase que separa reportar de prometer: **quién es el sujeto**. «La transportadora informó un reintento
para el 12» es un hecho con dueño; «te llega el 12» es una promesa por un tercero.

## Paquete de evidencia

Lo mínimo que hace escalable un caso, y lo mismo que hace defendible una decisión propia:

```markdown
Guía y pedido:
País y transportadora:
Cronología de eventos: fecha, código crudo, tipo homologado, origen
Intentos registrados y su resultado:
Última acción propia: qué, cuándo, quién
Soportes recibidos: cuáles, con fecha de recepción
Qué falta y a quién se le pidió:
Plazo que corre y qué pasa al vencer:
Registro de cada afirmación: verificado / documentado / hipótesis
```

Un dato que no está en el historial no se completa por analogía con otra transportadora ni por lo que
"suele pasar". Se declara faltante y se pide.

## Escalar al proveedor logístico

Escalar con disparador escrito, no por hartazgo. Disparadores típicos, a acordar con cada transportadora:

- el caso supera la antigüedad acordada sin evento nuevo del tercero;
- el mismo tipo se repite sobre la misma ruta, ciudad o centro por encima de su base;
- el plazo de reclamación está por vencer y el paquete de evidencia está completo;
- el evento reportado contradice a otro evento del mismo envío.

La escalación lleva el paquete de evidencia, el pedido concreto —qué acción se espera— y el plazo. Sin
pedido concreto, una escalación es una queja y vuelve sin respuesta.

## Salud de la cola

El indicador que engaña es "cerradas por día": sube cerrando lo fácil y sube más cerrando mal. Los que
sirven miden **espera**, y se leen juntos:

- **Antigüedad de la excepción más vieja abierta**: el titular. Una cola sana no tiene casos viejos, aunque
  cierre poco; una cola con casos de tres semanas está enferma aunque cierre mucho.
- **Distribución de antigüedad de lo abierto**, no su promedio: el promedio esconde exactamente la cola
  larga que hay que ver.
- **Entrante contra atendido** en la misma ventana: dice si el problema es de método o de capacidad.
- **Antigüedad al momento del cierre**, por tipo: dónde se demora de verdad el trabajo.
- **Reincidencia**: casos que vuelven a abrirse, y excepciones repetidas sobre la misma ruta o vendedor.
- **Bloqueadas por tercero**: cuánto de la cola no depende de la propia capacidad.

Fijar la expectativa como un plazo con una probabilidad —"el 85 % se resuelve en 3 días"— y no como un
promedio: es lo que permite decir que un caso está tarde mientras todavía se puede hacer algo.

## Control de calidad

- ¿Cada excepción de la cola tiene un dueño que efectivamente puede desbloquearla?
- ¿Lo que no se va a atender está declarado, o desaparece del informe?
- ¿Alguna comunicación promete algo cuyo sujeto es la transportadora?
- ¿Cada dato de tracking citado existe en el historial, con fecha y código crudo?
- ¿Lo automatizado tiene desenlace único, verificable y reversible?
- ¿Los casos escalados llevan pedido concreto y plazo, o son una queja?
- ¿El informe encabeza con antigüedad, o con cierres?
- ¿Los códigos que no homologaron se acumularon para revisar el catálogo?
- ¿Las decisiones que exceden a este cargo —dinero, fechas, estado externo— están pedidas con responsable?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026. Cada una se abrió en esta corrida; qué se leyó
y hasta dónde alcanza está en `learning/sources.yaml`.

- [GS1 EPCIS Standard 2.0](https://ref.gs1.org/standards/epcis/) (ratificado en junio de 2022): modelo de
  evento de visibilidad —qué, cuándo, dónde, por qué— y el elemento `ErrorDeclaration` para corregir un
  evento ya emitido sin borrarlo. Es la forma canónica de la cronología que sostiene un caso.
- [GS1 Core Business Vocabulary 2.0](https://ref.gs1.org/standards/cbv/) (ratificado en junio de 2022):
  valores de `disposition` —entre ellos `in_transit`, `damaged`, `destroyed`— y de `bizStep`. Sirve como
  referencia para diseñar un catálogo propio de tipos: la homologación de códigos crudos es un problema
  resuelto, no uno que haya que inventar por transportadora.
- [The Kanban Guide, mayo de 2025](https://kanbanguides.org/english/): define *Work Item Age* como «the
  elapsed time between when a work item started and the current date» y la *Service Level Expectation*
  como un pronóstico con período y probabilidad. De ahí sale medir la cola por espera y no por cierres.
- [Resolución CRC 3038 de 2011](https://normograma.crcom.gov.co/crc/compilacion/docs/resolucion_crc_3038_2011.htm)
  (Colombia), compilada en la [Resolución CRC 5050 de 2016](https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_crc_5050_2016.htm):
  régimen de protección de usuarios de servicios postales — PQR, indemnización por pérdida o avería,
  publicación de tiempos de entrega y devolución al remitente del objeto no entregado. Aplica a servicios
  postales en Colombia; no se extiende por analogía a transporte de carga ni a otro país.
- [Actas de la UPU](https://www.upu.int/en/universal-postal-union/about-upu/acts): Constitución,
  Reglamento General y Convenio Postal Universal con sus protocolos finales, en las versiones consolidadas
  vigentes. Referencia para operaciones postales transfronterizas.

Verificar contra el contrato de servicio y la norma vigente de cada transportadora y cada país: nada de lo
anterior reemplaza el acuerdo firmado, y el plazo que manda para una reclamación es el suyo.
