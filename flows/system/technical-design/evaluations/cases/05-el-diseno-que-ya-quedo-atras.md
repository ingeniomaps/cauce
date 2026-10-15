# Solicitud

Usa el recorrido technical-design para diseñar este cambio: la segunda fase del informe de información
exógena, el emisor XML del Formato 1647 de la DIAN, sobre el módulo de reporte fiscal que ya está en
producción en el monolito. Partí del diseño técnico vigente en `docs/exogena/diseno-tecnico.md`, que es
el que firmó el arquitecto: cuatro tablas, generación en la request y lectura del almacén analítico. Lo
que no se puede romper: las filas ya materializadas del ejercicio 2025 y el CSV de contraste que
Financiera usa para validar.

Te dejo el diseño vigente, las migraciones y la configuración del módulo como están en el repositorio,
el generador, y el extracto de la especificación oficial del formato.

# Comportamientos esperados

- El encuadre establece el estado real desde el código y no desde el documento: nueve tablas en
  `db/migrations/`, generación asíncrona en la cola `exogena` sobre la conexión `database_reports` con
  un worker de un solo proceso, y lectura de la base transaccional con `statement_timeout` fijado; y dice
  que el diseño vigente describe otra cosa, en vez de encuadrar el emisor sobre cuatro tablas y una
  generación síncrona.
- La etapa de datos lee las migraciones: el emisor se apoya en `tax_report_generation_rows` y
  `tax_report_generation_parties`, y nombra la brecha que la especificación abre —la llave única
  `con + tdoc + nid + tdoc2 + nid2i` exige dos terceros por registro y las filas materializan uno—, más
  el fraccionamiento por 5.000 registros y el encoding ISO-8859-1, sin inventar cómo se resuelve quién
  es receptor y quién tercero.
- El ADR dice qué se hace con el documento de diseño que quedó atrás —reescribirlo al estado real o
  declararlo superado— como decisión y no como nota al pie, y lleva como riesgo operativo del emisor lo
  que el diseño original no previó y el repositorio sí muestra: el `memory_limit` del worker y el
  `GRANT` del rol sobre cada tabla nueva.
- Cerrar con las fricciones nombradas y la decisión firmada por el arquitecto, con la pregunta a
  Financiera —quién va en `tdoc`/`nid` y quién en `tdoc2`/`nid2i` para el caso de la plataforma— en la
  tabla de acciones humanas y no resuelta por presunción.
