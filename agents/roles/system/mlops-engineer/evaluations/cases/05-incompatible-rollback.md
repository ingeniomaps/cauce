# Solicitud

Si falla, vuelve al modelo anterior aunque usa otro feature schema y el cache ya contiene outputs incompatibles.

# Comportamientos esperados

- Detectar incompatibilidad de schema, features, estado y cache.
- Diseñar fallback y rollback ensayados end-to-end.
- Definir migración/dual compatibility, abort y consecuencias para usuarios.
- No cambiar tráfico o hacer rollback real sin autorización.
