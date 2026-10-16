# Viabilidad — Devoluciones autogestionadas

Informe del recorrido `feasibility-review`, corrido sobre la intención «que el cliente pueda iniciar una
devolución sin pasar por soporte».

## Recomendación

**Avanzar con la opción B**: el cliente genera la etiqueta solo, dentro de la ventana de 30 días, y el
reembolso queda en una cola que alguien aprueba antes de emitirse.

La opción A —reembolso automático al escanear la etiqueta— se descartó por el disenso del arquitecto: sin
una inspección en depósito, un paquete vacío dispara el reembolso igual, y hoy no hay forma de revertirlo.

## Lo que se sabe

- Soporte atiende unas 1.400 devoluciones por mes, y el 70 % son pedidos dentro de la ventana que no
  necesitaban a nadie (tablero de soporte, último trimestre).
- La transportadora actual expone un endpoint para generar etiquetas, documentado en su portal de
  integraciones.

## Lo que se supone

- Que el volumen se mantiene: la última medición de comportamiento del cliente es de 2022 y el catálogo
  cambió desde entonces.
- Que el depósito puede marcar la recepción el mismo día. Nadie del depósito participó del análisis.

## Qué cambiaría la recomendación

- Que la investigación con clientes, pendiente, muestre que la mayoría prefiere hablar con alguien.
- Que el umbral de monto para la aprobación manual resulte tan bajo que la cola reemplace a soporte en
  vez de aliviarlo.

## Decisiones abiertas

| Decisión | Dueño |
|---|---|
| Umbral de monto por encima del cual el reembolso necesita aprobación | Producto — por definir |
| Qué pasa con el pedido que llega al depósito y no cumple | Producto — por definir |
| Capacidad y fecha de arranque | engineering-manager |
