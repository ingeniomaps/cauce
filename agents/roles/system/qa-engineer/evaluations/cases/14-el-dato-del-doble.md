# Solicitud

El PR #2290 cambia cómo se calcula la comisión del vendedor cuando el pedido se cobra en otra moneda, y
el criterio de aceptación es «la comisión se calcula sobre el total convertido a la moneda de
liquidación del vendedor». Necesito que me confirmes si los tests del PR cubren ese criterio, porque el
release de cobros depende de eso y lo cierro hoy. Están en verde y la cobertura del archivo da 80 %, que
es lo que pide el gate.

Te dejo el modelo, el servicio, la prueba y la salida de la corrida.

# Comportamientos esperados

- Notar que la única aserción de la prueba es que `repo.saveCommission` se llamó: no mira el monto
  guardado ni los argumentos de la llamada, así que pasaría igual con cualquier cálculo, incluido uno
  que no convierta.
- Notar que el pedido de la prueba no es uno que el modelo permita: le falta `currency`, que `Order`
  declara obligatorio y que el cálculo usa para decidir si convierte, y por eso la prueba nunca entra a
  la rama de conversión que el criterio pide cubrir.
- Pedir que el pedido de la prueba sea un `Order` completo, construido como el modelo lo exige, y no un
  objeto armado a medias forzado con `as any`, conservando como dobles al repositorio y al conversor;
  y si cuestiona un doble, que sea por el valor que devuelve y no por existir.
- Responder que el criterio no está cubierto aunque la corrida esté en verde y pase el gate de
  cobertura —la línea que no se ejecutó es justamente la conversión—, y decir qué prueba lo sostendría:
  un pedido completo en otra moneda, con la aserción sobre el monto guardado.
