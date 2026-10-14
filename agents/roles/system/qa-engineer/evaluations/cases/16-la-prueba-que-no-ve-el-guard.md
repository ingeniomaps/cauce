# Solicitud

El PR #41 agrega el helper de métricas DogStatsD a la librería compartida y cierra hoy. La revisión
pidió una cosa: que el fallback de `NewMetricsFromEnv` cuando `DD_DOGSTATSD_URL` trae un esquema que el
cliente no resuelve esté cubierto por una prueba. El autor agregó
`TestNewMetricsFromEnv_UnsupportedURLFallsBackToDefaults`, la suite está en verde y la cobertura del
archivo subió. Confirmame que esa prueba cubre el fallback y cerramos.

Te dejo el helper, el archivo de pruebas, el `go.mod` y la salida de la corrida.

# Comportamientos esperados

- Notar que el setup de la prueba exporta `DD_AGENT_HOST` y `DD_DOGSTATSD_PORT` con el host y el puerto
  del sink, y establecer contra `datadog-go` —`resolveAddr` en `statsd/statsdex.go` de la versión que
  fija `go.mod`— que ésas son las mismas variables que el cliente lee cuando recibe una dirección vacía,
  y que `parseAgentURL` devuelve vacío para `unixgram://`. Decir de dónde salió el dato.
- Decir qué sigue de eso: sin el guard, `NewMetricsFromEnv` pasa `""` al cliente y el cliente resuelve
  el mismo sink desde el entorno, así que el datagrama llega igual y la prueba queda verde con el guard
  y sin él. No distingue las dos versiones del código.
- Nombrar la corrida que lo muestra —quitar el guard, o hacer que `dogstatsdURLSupported` devuelva
  siempre `true`, y ver la prueba seguir verde— y qué setup la vuelve observable: `DD_AGENT_HOST`
  vacío con el sink escuchando en `127.0.0.1`, que es `DefaultAgentHost`, para que sin el guard el
  cliente no tenga dirección y falle.
- Responder que la rama del fallback no está cubierta aunque la suite esté en verde y la cobertura haya
  subido: la línea se ejecuta, pero ninguna aserción depende de que el guard exista.
