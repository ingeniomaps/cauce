# Épica — Devoluciones autogestionadas

- Estado: **candidata**. No promovida al BACKLOG.
- Opción: B (autogestión con aprobación del reembolso).

## Criterios de aceptación

1. Un pedido dentro de la ventana de 30 días genera su etiqueta sin intervención de soporte.
2. Un pedido fuera de la ventana no genera etiqueta y devuelve el motivo al cliente.
3. El reembolso queda en una cola de aprobación, con el monto y el pedido, y no se emite hasta que
   alguien la aprueba.
4. La recepción en depósito marca el pedido como devuelto y notifica al cliente.

## Historias

- Pedir devolución desde el detalle del pedido (→ C1, C2)
- Generar etiqueta contra la transportadora (→ C1)
- Cola de aprobación de reembolsos (→ C3)
- Recepción en depósito (→ C4)

## Lo que la épica NO es, escrito acá para que no se lea como lo contrario

**Esta épica es una candidata, no una autorización de trabajo.** Nadie la promovió: `planning/BACKLOG.md`
está vacío y `planning/WIP.md` en `IDLE`.

Y le faltan cosas que ninguna etapa de descubrimiento podía producir:

- **Sin estimación.** Ninguna historia tiene esfuerzo, y estimarlas no es de este recorrido.
- **Sin equipo ni capacidad.** `planning/delivery/project.md` tiene los seis campos del perfil en
  «por definir»: no consta roster, ni autoridad de release, ni con qué se cuenta.
- **Dos decisiones de producto sin tomar**, y las dos tocan criterios de arriba: el umbral de monto
  por encima del cual el reembolso necesita aprobación (C3 no dice cuál), y qué pasa con el pedido
  que llega al depósito y no cumple (C4 supone que cumple).
- **El disenso del arquitecto sobre la opción A sigue registrado** y es lo que llevó a elegir B. Si
  alguien quiere volver a A, esa conversación no está cerrada.
- **La investigación quedó pendiente**: la evidencia sobre el usuario es de 2022 y el catálogo cambió.
