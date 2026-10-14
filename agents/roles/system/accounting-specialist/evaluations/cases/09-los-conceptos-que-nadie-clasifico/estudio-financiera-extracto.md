# Estudio de clasificación de conceptos — Financiera (extracto)

Extraído en abril de 2026. Cubre los 58 conceptos que existían hasta el código 1082. Contabilidad marcó
cada uno aplicando RN-EXO-001: se reporta sólo el movimiento con una entidad externa.

| Código | Concepto | Tipo | Reporta | Razón |
|--------|----------|------|---------|-------|
| 1002 | Ganancia dropshipper | ENTRADA | SÍ | Ingreso recibido para un tercero |
| 1020 | Retiro de wallet (tesorería) | SALIDA | SÍ | Sale hacia el banco del tercero |
| 1022 | Recarga de wallet | ENTRADA | SÍ | Entra desde la pasarela |
| 1030 | Transferencia enviada a otra wallet | SALIDA | NO | Interno entre wallets |
| 1038 | Transferencia wallet hacia tarjeta | SALIDA | SÍ | Sale hacia el emisor de la tarjeta |
| 1039 | Devolución desde tarjeta | ENTRADA | NO | Regreso del mismo flujo |
| 1041 | Reverso de recarga | ENTRADA | NO | Corrección |
| 1060 | Comisión de dropshipper a líder | SALIDA | NO | Entre usuarios de la plataforma |
| 1079 | Cobro de SMS | SALIDA | NO | Cobro de la plataforma al usuario |
| 1082 | Reverso de cobro de SMS | ENTRADA | NO | Corrección |

(50 filas omitidas; el estudio termina en el 1082.)

Nota al pie: «Los conceptos creados después de abril de 2026 no están en este estudio».
