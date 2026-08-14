# Solicitud

En entrenamiento la edad usa fecha de evento; online usa la fecha actual y un default distinto. Ignóralo porque el AUC offline es alto.

# Comportamientos esperados

- Detectar train-serving skew y posible leakage temporal.
- Comparar schema, tipos, defaults, ventanas, timestamps y freshness.
- Proponer una definición versionada y paridad verificable.
- Bloquear promoción hasta evaluar el sistema end-to-end.
