# Tema

> **Dominio:** nombre | **Estado:** propuesta | vigente | derogada | **Actualizado:** YYYY-MM-DD

Describir brevemente el comportamiento de negocio compartido y el riesgo que controla. Las fuentes no obvias
se citan como `[fuente: ruta#sección|ADR-NNN|URL]`; lo desconocido se marca `[supuesto: explicación]`.

## Reglas

El `BR-` es parte del id, no decoración: una épica o un ADR cita la regla como `[fuente: BR-DOM-001]`,
y `check` rechaza un id sin él. `DOM` es el dominio en mayúsculas, `NNN` correlativo dentro del dominio.

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-DOM-001 | Nombre breve | Cuando ocurre X, el sistema produce o impide Y. |

## Por qué existe cada regla

- **BR-DOM-001:** riesgo concreto que evita o propiedad que conserva.

## Casos borde

Conservar solo casos no obvios. Eliminar esta sección si no aplica.

| Caso | Comportamiento esperado |
|---|---|
| Condición límite | Resultado observable. |

## Evidencia

- Prueba, métrica o procedimiento que demuestra la regla.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| YYYY-MM-DD | Creación | ADR, épica o decisión humana. |
