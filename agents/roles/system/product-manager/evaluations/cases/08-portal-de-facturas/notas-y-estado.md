# Notas de las tres llamadas

**Nordwind (14 de julio).** «Le pedimos las facturas a Marcela por correo y a veces tarda dos días. Lo
que necesitamos es la del mes, en PDF, para pasarla a contabilidad.» Preguntaron también si podrían ver
las de años anteriores «para una auditoría que nos hacen en octubre».

**Delta Sur (22 de julio).** «Cuando anulan una factura y emiten otra nos quedamos con las dos y no
sabemos cuál vale.» Piden que se vea cuál está anulada.

**Ferretería Ovalle (2 de agosto).** «Somos tres personas con acceso a la cuenta y no todas deberían ver
la facturación.» No supieron decir quién sí y quién no; dijeron que lo definirían ellos.

# Lo que pasó el equipo de facturación

- Las facturas se emiten en **Contafacil**, que expone una API de lectura. Devuelve las facturas
  emitidas **desde el 1 de marzo de este año**: es cuando migraron.
- Lo anterior a marzo está en el sistema viejo, **Sigma**, que no tiene API. Hay un volcado en CSV de
  47.000 facturas y los PDF en un disco de red, con el nombre del archivo como única forma de
  relacionarlos. Nadie comprobó que el volcado esté completo.
- La sincronización con Contafacil es un proceso nocturno. Una factura emitida hoy a las 15:00 aparece
  mañana. Cambiarlo a tiempo real «no es imposible pero no está hecho».
- Cuando Contafacil no responde, hoy el sistema devuelve una lista vacía. No hay diferencia entre «no
  tenés facturas» y «no pudimos preguntar».
- **No hay analítica de producto en la plataforma.** No se puede saber cuántos clientes usan una
  pantalla, ni con qué frecuencia. Nadie tiene un tablero.
- Los permisos por usuario dentro de una cuenta existen, con tres roles fijos: dueño, operación y
  lectura. No hay un permiso específico de facturación.
