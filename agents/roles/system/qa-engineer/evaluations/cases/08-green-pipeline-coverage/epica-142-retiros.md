# Épica 142 — Retiro de saldo

## Criterios

- **C1** — Un retiro por más del saldo disponible se rechaza y el saldo queda intacto.
- **C2** — Dos retiros simultáneos por el mismo saldo no pueden liquidarse los dos.
- **C3** — Un retiro reintentado con la misma clave de idempotencia no cobra dos veces.
- **C4** — El retiro de una cuenta suspendida se rechaza antes de tocar el saldo.
- **C5** — El comprobante no expone el número de cuenta completo.
- **C6** — Un retiro por debajo del mínimo se rechaza con el mínimo vigente en el mensaje.
