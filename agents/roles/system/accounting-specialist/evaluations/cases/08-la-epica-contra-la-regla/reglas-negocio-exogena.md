# Exógena: Reglas de Negocio del Formato 1647

> **Dominio:** exogena | **Estado:** vigente | **Actualizado:** 2026-09-18

## Definiciones

| Término | Definición |
|---------|-----------|
| Concepto | Valor de `history_wallets.identification_code`. Catálogo en `config/constants.php` |
| Entidad externa | Banco, pasarela de pago, transportadora, tarjeta: cualquier actor fuera de la plataforma |
| Wallet de sistema | Wallet propia de la plataforma, no de un tercero |

## RN-EXO-001: Criterio de clasificación por entidad externa

**Descripción:** sólo se reporta el movimiento que implica flujo real de dinero con una entidad
externa. Las entradas deben venir de una entidad externa y las salidas deben ir hacia una entidad
externa.

**Resultado esperado:** los movimientos puramente internos de la plataforma quedan fuera del reporte,
sin importar su monto.

**Excepciones:** ninguna. Es el criterio que define la lista, no una heurística.

**Origen:** definición de Contabilidad, confirmada en el estudio de clasificación de Financiera.

## RN-EXO-002: Llave de clasificación (código + tipo)

**Descripción:** la unidad de parametrización es la pareja `(identification_code, type)`, no el código
solo. Un mismo concepto puede ser reportable en un sentido y no en el otro.

**Ejemplo canónico:** `1038` (salida de wallet hacia la tarjeta) se reporta; `1039` (entrada de regreso
desde la tarjeta) no.

## RN-EXO-003: Conceptos reportables vigentes

**Descripción:** la lista vigente son 18 parejas y vive en la tabla de parametrización, nunca
hardcodeada.

**Entradas (12):** 1002, 1006, 1022, 1068, 1005, 1007, 1032, 1036, 1054, 1059, 1062, 1065.

**Salidas (6):** 1020, 1026, 1038, 1014, 1102, 1088.

**Conceptos excluidos por categoría:** correcciones y reversas, transferencias entre wallets, recarga y
retiro cruzado entre marcas blancas, comisiones entre usuarios, indemnizaciones, garantías, cobros de
SMS y de constructor de páginas.
