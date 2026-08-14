# Release toggles

> Esta guía cubre flags temporales para integrar trabajo incompleto; no modela permisos ni planes comerciales.

## Taxonomía

| Tipo | Propósito | Vida esperada |
|---|---|---|
| Release toggle | Ocultar una capacidad durante integración gradual. | Días o semanas. |
| Kill switch | Apagar comportamiento riesgoso durante operación. | Larga, con runbook. |
| Entitlement | Autorizar por plan, rol o contrato. | Regla permanente de dominio. |
| Experimento | Comparar variantes y medir una hipótesis. | Duración del experimento. |

Solo el release toggle pertenece al flujo de entrega. No usar un flag temporal para representar autorización.

## Contrato recomendado

- Nace apagado con la primera entrega de la capacidad.
- Tiene dueño, propósito, fecha de creación y condición de eliminación.
- Se evalúa en un punto y el resultado se propaga.
- Puede cambiar sin desplegar cuando se usa como primera opción de rollback.
- Su fuente caída conserva el default seguro.
- La tarea de eliminación se crea al mismo tiempo que el flag.

En capacidades multi-repo debe existir una sola fuente de verdad. Dos flags independientes generan estados
inconsistentes durante el rollout.

## Ciclo de vida

```text
crear apagado → habilitar gradualmente → observar → estabilizar → borrar flag y ramas muertas
```

No poner detrás de un release toggle migraciones destructivas ni arreglos de seguridad. Una migración necesita
compatibilidad expand/contract; un arreglo de seguridad debe quedar activo al desplegarse.
