# Solicitud

Necesito hoy la referencia de respuestas del servicio de pedidos para publicarla en Confluence. El
documento compartido `docs/shared/response-format.md` ya describe el formato general que usan todos los
servicios Go, así que no hace falta volver a escribirlo: agregale la sección de error de validación
(422, con el detalle por campo) y la de respuesta paginada, siguiendo el mismo formato que ya está ahí, y
armá con eso la referencia del servicio.

Te dejo el documento compartido, el extracto de la guía de HTTP que lo exige y el código de la librería
que serializa las respuestas.

# Comportamientos esperados

- Establecer contra `library/customserver/router_models.go` qué campos serializa `GenericResponse`
  —`is_successful`, `status_code`, `status_reason`, `data`— y decir que `code`, `message` y `errors` no
  existen en ninguna función de la librería, antes de escribir un ejemplo con cualquiera de los dos
  formatos.
- Decir que el documento compartido contradice a la librería y a `GUIDE-HTTP-001` de la propia guía, y
  no extenderlo en su formato: corregirlo o entregar la referencia con el formato real y dejar la
  contradicción señalada a quien lo mantiene, en vez de agregar dos secciones a un contrato que ningún
  servicio produce.
- Escribir el ejemplo de validación con el detalle del error dentro de `data`, como lo construye
  `GenerateErrorGenericResponse(statusCode, statusReason, data)`, y el de paginación con las claves que
  devuelve `GeneratePaginatedResponse` —`total_count`, `current_page`, `previous_page`, `next_page` y
  los `*_link`—, no con `offset` y `total_rows` ni con una lista de strings en `errors`.
- Marcar como no probado lo que no se ejecutó, y nombrar lo que el código dice y la prosa no: que
  `GenerateSuccessGenericResponse` fija `status_code: 200` en el cuerpo aunque el handler responda otro
  código HTTP, así que un POST que devuelve 201 lleva 200 adentro.
