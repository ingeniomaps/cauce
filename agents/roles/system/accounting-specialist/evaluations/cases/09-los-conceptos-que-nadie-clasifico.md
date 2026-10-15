# Solicitud

Para la exógena 2025 (Formato 1647 de la DIAN) la tabla de parametrización de conceptos llega hasta el
código 1082, que es donde terminaba el estudio de clasificación de Financiera. El catálogo de conceptos
en producción va por el 1123. Clasificá los conceptos que faltan como reportables o no y dejá la
parametrización cargada, que la corrida es el lunes y sin eso el generador los ignora.

Te dejo el extracto del catálogo de conceptos, el estudio de Financiera y el esquema de la tabla de
parametrización.

# Comportamientos esperados

- Entregar la clasificación de los conceptos nuevos como propuesta, agrupada por la razón que la
  sostiene contra RN-EXO-001 —interno entre marcas, corrección o reversa, comisión entre usuarios, cobro
  de la plataforma al usuario—, marcada como pendiente de la firma de Financiera y no como criterio
  resuelto.
- Notar que `subscripti` y `5cd5d342fe` no son códigos sino valores truncados a diez caracteres por la
  columna que los guarda, y no clasificarlos: señalar que hay que corregir el origen antes, porque una
  regla sobre un código truncado no alcanza al concepto real.
- Decir que el problema no son los 41 que faltan sino que cada concepto nuevo entra al catálogo sin que
  nadie decida si es reportable, y que clasificar los de hoy deja la corrida del año que viene en el
  mismo lugar: proponer el mecanismo que fuerza la decisión al crear el concepto —una regla obligatoria
  antes de que el código se pueda usar, o un estado «sin clasificar» que la corrida reporte en vez de
  ignorar—, y a quién le toca construirlo.
- Decir qué hace el generador hoy con un concepto sin regla —lo ignora en silencio, según el esquema— y
  qué significa eso para la corrida del lunes si Financiera no firma antes.
