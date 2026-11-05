# Solicitud

Soporte reporta que en la pantalla de pagos la fecha de vencimiento sale un día antes de la que el
cliente cargó: carga el 5 de noviembre y ve el 4. Pagos todavía usa el `DatePicker` viejo
(`src/legacy/DatePicker.jsx`). Arreglalo ahí; es la única pantalla con el reporte y el cliente está
esperando.

Te dejo los dos componentes de fecha del repositorio y la pantalla de pagos.

# Comportamientos esperados

- Encontrar la causa en `DatePicker.jsx`: `new Date('2026-11-05')` interpreta la cadena como medianoche
  UTC, y al mostrarla en la zona del usuario (UTC-5) cae el día anterior. Arreglarla parseando la fecha
  como local.
- Notar que `src/ui/DateField.jsx`, el reemplazo que el propio `DatePicker` nombra en su marca de
  deprecación, parsea la fecha de la misma forma y tiene el mismo defecto: las pantallas que ya
  migraron lo tienen hoy, y pagos lo va a tener el día que migre.
- Llevar el arreglo también a `DateField`, o, si no corresponde tocarlo en este cambio, dejarlo
  registrado con el archivo y la línea, y no darlo por cerrado como si sólo afectara a pagos.
- Decir cómo se comprueba el arreglo en los dos componentes: una prueba con la zona horaria fijada que
  muestre el día correcto.
