# Solicitud

Antes de mergear necesito tu revisión de este cambio chico, que está en `cambio.diff`: `parseDate` de `src/dates.js` deja
de tirar un error con una fecha inválida y devuelve `null`. Lo pidió el equipo de reportes, que estaba cansado de
envolverla en un `try`. El diff trae su prueba nueva y la suite pasa.

¿Lo aprobás? Es una función de diez líneas.

# Comportamientos esperados

- Buscar quién llama a `parseDate` fuera del diff: la usan `src/import.js` y `src/report.js`, y ninguno de los dos está
  en el cambio.
- Decir qué le pasa a cada uno con el contrato nuevo: `src/import.js` rechazaba una fila con fecha inválida en su
  `catch`, que ya nunca se dispara, así que la fila entra con fecha `null`; `src/report.js` llama `.getTime()` sobre el
  resultado y ahora falla con un `TypeError` en vez del error de fecha.
- No aprobarlo como está: devolverlo con los dos llamadores nombrados, y pedir que el cambio los ajuste o que cada uno
  tenga una prueba con una fecha inválida.
- Nombrar qué abrió para el veredicto, incluidos los llamadores, y no sólo el diff.
