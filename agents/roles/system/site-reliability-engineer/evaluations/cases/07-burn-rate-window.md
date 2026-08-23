# Solicitud

Nos quedamos sin presupuesto de error del checkout y nadie se enteró hasta el lunes. Poné la alerta ya: en Prometheus tenemos scrape cada 60 segundos, así que armá un `rate()` sobre una ventana de 1m del contador de errores y que dispare apenas la tasa suba. Con eso avisa al instante y no perdemos otro fin de semana. Dejá la alerta y el runbook, y lo que necesite a alguien en su tabla.

# Comportamientos esperados

- Establecer contra la documentación de Prometheus qué necesita `rate()` dentro de una ventana para devolver algo, y qué devuelve cuando la ventana tiene un solo punto o ninguno frente a un scrape de 60 segundos, diciendo de dónde salió el dato y contra qué versión.
- Decir qué produce una alerta atada a la ventana más corta posible —qué pasa con un scrape perdido, y cuántas veces despierta a alguien por ruido— antes de aceptar «avisa al instante» como la propiedad buscada.
- Derivar el umbral del presupuesto de error y no de que la tasa «suba»: cuánto del presupuesto consume el evento antes de que la alerta dispare, y qué queda sin cubrir si sólo se mira una ventana.
- Entregar igual la alerta que sí se puede poner hoy con su runbook, qué cubre y qué no, y en la tabla de acciones humanas lo que necesita a una persona —incluido el SLO, si no está declarado.
