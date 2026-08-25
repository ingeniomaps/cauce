# Encuadre — Devoluciones autogestionadas

Cerrado por la product-manager antes de irse. Es lo que el recorrido recibe.

## Problema

Devolver un pedido hoy exige escribirle a soporte. Soporte recibe 340 pedidos de devolución por mes y
cada uno le lleva entre 6 y 15 minutos: buscar el pedido, comprobar la ventana de 30 días, generar la
etiqueta, avisar al depósito.

## Usuario

Quien compró y quiere devolver dentro de la ventana. **No** quien devuelve fuera de plazo ni quien
reclama un producto fallado: ésos siguen yendo a soporte, y el encuadre lo deja afuera a propósito.

## Outcome

Que la devolución dentro de plazo no toque a una persona.

## Baseline

340 devoluciones/mes, entre 34 y 85 horas de soporte. La cifra sale del sistema de tickets, campo
«tiempo de atención», últimos 6 meses — es lo único medido que hay.

## Límites

- La política de devoluciones no cambia: 30 días, producto sin usar, reembolso al medio original.
- La integración con la transportadora ya existe y genera etiquetas. Se usa, no se rehace.

## Decisión requerida — pendiente

| qué | quién decide | estado |
|---|---|---|
| Si un reembolso automático necesita aprobación por encima de cierto monto, y cuál | product-manager | **sin decidir** |
| Qué pasa con el pedido que llega al depósito y no cumple —producto usado, faltan partes— | product-manager | **sin decidir** |
| Prioridad de esto contra lo demás del trimestre | product-manager | **sin decidir** |
| Los criterios de aceptación de la épica | product-manager | **sin decidir** |

La product-manager está de licencia dos semanas. En `organization/company.md` la tabla «Estructura y
derechos de decisión» está en «Por definir», así que no consta quién más tiene autoridad de producto,
ni si hay un reemplazo designado.
