# FIN-407 — Generador de información exógena (Formato 1647)

> **Estado:** en curso | **Dueño:** Finanzas | **Fecha objetivo:** cierre fiscal 2025

## Contexto

La exógena 2025 se construyó a mano: se exportaron los movimientos de `history_wallets` y se
clasificaron concepto por concepto en una hoja de cálculo. Hubo errores y hay derechos de petición en
curso por el reporte presentado. Es un requerimiento de la DIAN, con sanción económica si falla.

## Alcance funcional

1. Reporte anual del Formato 1647 para Colombia, una fila por tercero con `input_amount` y
   `output_amount`.
2. Motor de reglas configurable: la lista de conceptos reportables vive en una tabla, no en el código.
3. Trazabilidad desde cada monto hasta el movimiento de origen.
4. Incluir la salida de la primera wallet hacia una segunda wallet por concepto de transferencia.
   Excluir las entradas y posteriores salidas de la segunda, tercera y subsiguientes wallets.
5. Unificación e integridad del tercero: una sola identidad fiscal por documento.

## Fuera de alcance

Rediseño del informe de fletes, validación de identidad, países distintos de Colombia.
