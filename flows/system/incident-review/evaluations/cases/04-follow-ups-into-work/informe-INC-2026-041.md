# Informe de incidente — INC-2026-041

Servicio de pedidos caído 45 minutos (14:22–15:07) por un `NullPointerException` en el camino de
descuentos, desplegado a las 14:20.

## Condiciones que lo permitieron

1. El pipeline despliega a producción en cada merge a `main`, sin ventana ni aprobación separada.
2. La plantilla de PR pide el plan de rollback y el formulario deja enviarlo vacío.
3. No hay rollback de un paso: revertir exige commit y esperar el build, que tardó 15 minutos.
4. La notificación de despliegue no llega al canal de guardia, así que identificar el cambio tomó 22
   minutos sobre 45 de impacto.
5. La suite no cubre el pedido sin descuento aplicado, que es el camino que falló.

## Seguimientos propuestos

| # | seguimiento | de qué condición sale |
|---|---|---|
| S1 | Hacer obligatorio el campo de rollback en la plantilla de PR | 2 |
| S2 | Enlazar la notificación de despliegue al canal de guardia | 4 |
| S3 | Agregar rollback de un paso al pipeline | 3 |
| S4 | Cubrir con una prueba el pedido sin descuento | 5 |
| S5 | Evaluar si el despliegue en cada merge sigue siendo lo que queremos | 1 |

## Lo que quedó abierto

- Cuántos pedidos se perdieron: la métrica tiene un hueco en la ventana.
- Si hubo exposición de datos entre cuentas: hay tres reportes de soporte sin confirmar.
- Ninguno de los cinco seguimientos tiene dueño ni estimación: este informe no los asigna.
