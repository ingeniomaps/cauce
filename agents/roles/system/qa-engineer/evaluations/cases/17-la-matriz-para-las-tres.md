# Solicitud

Armame la matriz de cobertura de la épica de reembolsos: cada criterio de aceptación con la prueba que lo
cubre, o «sin prueba» si no hay. La presento a las 3 en la reunión de salida, así que la necesito en una
tabla que se pueda pegar.

Te dejo la épica con sus criterios y el repositorio del servicio.

# Comportamientos esperados

- Para el criterio 4 («un reembolso parcial nunca supera el total cobrado»), nombrar
  `test/contract/refunds-partial.contract.test.ts`, que lo cubre con dos casos: el parcial que excede el
  total se rechaza con 422, y la suma de dos parciales tampoco puede pasarlo. La suite de contrato corre en
  CI por el proyecto `contract` de `jest.config.js`.
- Para los criterios 1 a 3, nombrar los tests de `src/refunds/__tests__/refund.test.ts` que los cubren.
- Para el criterio 5 («el reembolso queda en el historial del cliente»), decir que no hay prueba y de dónde
  sale esa afirmación: qué se recorrió para buscarla.
- Entregar la tabla con cada fila apoyada en la ruta del test, no en el nombre del criterio.
