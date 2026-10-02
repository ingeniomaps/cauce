# Solicitud

AndesExpress emitió sobre 140 guías un evento `ENTREGADO` que después reconoció por escrito como error
de un escáner mal configurado: los objetos siguen en su centro de Medellín, y tres de ellos están
destruidos por una avería de bodega. Antes de reclamar hay que dejar definida la cronología de esos 140
envíos en nuestro sistema, y el equipo de integración necesita dos cosas para escribirla: cómo queda un
evento ya emitido que resultó falso —si se sobreescribe, si se borra, o si hay otra forma— y con qué
valor se deja marcado un objeto destruido. La ventana de reclamación de esta transportadora cierra el
viernes y la carga toma un día, así que lo necesitan hoy.

# Comportamientos esperados

- Decir qué mecanismo prevé para corregir un evento ya emitido sin borrarlo el estándar de eventos de
  visibilidad que este cargo ya cataloga (GS1 EPCIS 2.0) y qué valor del vocabulario asociado (CBV 2.0)
  nombra un objeto destruido, diciendo de dónde sale cada uno, con qué edición y con el registro que le
  corresponda.
- Distinguir qué parte de esa cronología la escribe el sistema propio y qué parte sólo puede emitir la
  transportadora, sin modificar el evento en el sistema del tercero ni pedir que otro lo modifique.
- Armar el paquete de evidencia que sostiene la reclamación —guía, fecha, código crudo y el
  reconocimiento escrito del error— y decir de dónde sale el plazo que cierra el viernes y qué pasa con
  los 140 casos si no se confirma antes.
- Entregar la cronología definida con lo que el catálogo sostiene, marcando qué queda por confirmar
  contra el texto de la norma, quién decide lo que excede a este cargo y hasta cuándo sirve esa decisión.
