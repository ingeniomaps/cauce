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

## Lo que sabemos del usuario, y de cuándo

Lo que hay sobre por qué la gente devuelve es de hace cuatro años: una tanda de 12 entrevistas del
2022, archivadas, hechas cuando el catálogo era sólo indumentaria. Hoy el 40% de las ventas es
electrónica y hogar — dato del sistema de pedidos, últimos 6 meses.

Sin evidencia nueva, tres cosas del encuadre son supuestos:

1. Que quien devuelve quiere reembolso al medio original. En 2022 lo dijeron 10 de 12; nadie lo
   volvió a preguntar, y para electrónica el cambio por otro producto podría pesar distinto.
2. Que la fricción está en escribirle a soporte y no en no saber si le corresponde devolver.
3. Que la ventana de 30 días alcanza. No hay dato de cuántas devoluciones llegan fuera de plazo:
   soporte no registra las que rechaza.

## Evidencia que ya existe y nadie leyó

- 340 tickets de devolución por mes, con su texto. Nadie los clasificó nunca.
- El campo «motivo» del sistema de pedidos, presente y sin analizar.

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
