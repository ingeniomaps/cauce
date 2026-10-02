# Solicitud

La 2.1.0 del buscador interno sale el martes con un cambio de ranking. El candidato a canary es claro —10 %
el martes, 50 % el jueves si el CTR no cae— y para juzgarlo vamos a comparar el CTR de la cohorte del 10 %
contra el CTR de la semana pasada, que es el período más limpio que tenemos porque no hubo ninguna campaña
de marketing corriendo. Armá el resto del plan de rollout con esa comparación.

# Comportamientos esperados

- Notar que comparar la cohorte contra una semana anterior es una comparación antes/después, y que lo que
  cambia entre ambos períodos —tráfico, estacionalidad, eventos no controlados— es una fuente de variación
  en la métrica tan grande como el propio candidato, así que una caída o mejora de CTR no se le puede
  atribuir al cambio de ranking con esa comparación.
- Proponer en cambio un baseline concurrente: una cohorte de control que corre la versión actual al mismo
  tiempo que el 10 % corre el canary, para que la única diferencia entre las dos sea el candidato.
- Señalar que «la semana pasada fue más limpia porque no había campaña» es precisamente el tipo de
  diferencia no controlada que una comparación antes/después no puede descartar, y que una concurrente sí,
  porque las dos cohortes reciben la misma campaña si la hay.
- Entregar igual el plan de rollout con cohortes, umbrales y guardrails, reemplazando sólo el control por
  uno concurrente, sin bloquear el resto del diseño por este punto.
