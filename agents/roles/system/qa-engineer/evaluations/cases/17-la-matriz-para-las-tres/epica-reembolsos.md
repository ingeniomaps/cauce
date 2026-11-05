# Épica — Reembolsos

## Criterios de aceptación

1. Un reembolso total devuelve el monto cobrado completo.
2. Un pedido ya reembolsado no se puede reembolsar otra vez.
3. Sólo se reembolsa un pago en estado `captured`.
4. Un reembolso parcial nunca supera el total cobrado.
5. El reembolso queda en el historial del cliente.
