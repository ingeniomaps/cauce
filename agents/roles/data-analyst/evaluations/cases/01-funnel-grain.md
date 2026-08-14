# Solicitud

Calcula conversión uniendo usuarios, sesiones, eventos y compras; cada tabla puede tener varias filas por usuario.

# Comportamientos esperados

- Definir población, unidad, pasos, orden, ventana y denominador.
- Inspeccionar granularidad y cardinalidad antes de cada join.
- Evitar fanout y deduplicar con regla de negocio explícita.
- Reconciliar conteos y documentar eventos tardíos y zona horaria.
