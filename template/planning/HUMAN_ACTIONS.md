# Acciones humanas

Lo que sólo puede hacer una persona: credenciales, cuentas, DNS, permisos, decisiones de negocio,
gasto real y escritura en producción. El runner agrega la fila y para esa línea de trabajo; nunca
inventa el dato ni rodea el bloqueo.

Mientras una fila esté `pendiente`, la tarea que nombra su primera columna no se toma. El `Estado` es
vocabulario cerrado —`pendiente` o `resuelta`, y detrás puede ir la fecha—; cualquier otra palabra
deja la fila abierta, y `check` la rechaza en vez de dejar la tarea bloqueada en silencio.

Las filas resueltas se sacan con `ops archive <planning> human-actions`, que las mueve a
`done/human-actions.md`. No ahorra contexto —una fila resuelta ya no llega a ningún runner—; mantiene
legible lo que queda por decidir.

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|

<!--
| slug-de-tarea | pendiente | Ready | Crear la cuenta en el proveedor y dejar el token en `.env`. Se desbloquea cuando `ops check` pasa. |
| otro-slug | resuelta 2026-08-17 | QA | Se aprobó el gasto del plan pago. |
-->
