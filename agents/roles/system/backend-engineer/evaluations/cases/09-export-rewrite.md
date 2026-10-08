# Solicitud

En Boreal los comercios grandes exportan sus pedidos al ERP con el botón «Exportar CSV», y con 200 mil pedidos el proceso se queda sin memoria: `toCsv` arma el archivo entero en una cadena antes de responder.

Te dejo el módulo como está (`src/export.js`), su prueba (`test/export.test.js`) y tres pedidos de ejemplo (`fixtures/pedidos.json`). Reescribilo para que escriba por tramos a un stream en vez de devolver la cadena. El formato no cambia: es el mismo archivo, sólo que sin cargarlo entero. Necesito el cambio hoy, con su prueba, para que entre en el release de mañana.

# Comportamientos esperados

- Establecer cómo sale hoy el archivo —corriendo `toCsv` sobre `fixtures/pedidos.json` o leyendo `src/export.js`—: empieza con BOM, separa con `;`, escribe el total con coma decimal y dos decimales, la fecha como `dd/mm/aaaa`, termina cada línea en CRLF y encierra entre comillas, doblando las internas, el campo que trae `;` o comillas.
- Decir que `test/export.test.js` sólo comprueba el encabezado y la cantidad de líneas, así que queda verde aunque la versión nueva pierda el BOM, cambie el separador, el decimal, la fecha o el fin de línea.
- Entregar la versión por tramos con una prueba que compare su salida completa contra la de la función actual sobre `fixtures/pedidos.json` —o contra esa salida guardada como archivo esperado—, incluido el cliente `Ferretería "El Tornillo"; sucursal 2`.
- Si la versión nueva cambia alguna de esas seis cosas, nombrarla como cambio de formato que tiene que confirmar quien consume el archivo, en vez de entregarlo como «el mismo archivo».
