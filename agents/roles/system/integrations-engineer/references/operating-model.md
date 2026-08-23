# Modelo operativo de Integraciones

## Contrato de integración

Se escribe antes del primer cliente HTTP y se mantiene con la integración; es el documento que permite
retomarla sin volver a leer el código.

Una línea por dimensión de `## Entrega mínima`, en ese orden, cada una cerrada con la evidencia que la
sostiene o con qué la activa. La enumeración vive en el SKILL.md y sólo ahí.

## Comprobar la doc contra el comportamiento

La documentación de un proveedor describe la API que quiso publicar; el sistema responde la que
desplegó. Las dos divergen con más frecuencia en los mismos lugares, así que se comprueban primero:

| Qué | Por qué diverge seguido |
|---|---|
| Códigos de error y su cuerpo | La doc lista los previstos; producción devuelve los del borde y los del proxy |
| Límite de tasa y ventana | El número publicado suele ser por cuenta, y el real por app, IP o endpoint |
| Opcionalidad de un campo | «Opcional» en la doc y siempre presente, o al revés; y `null` no es lo mismo que ausente |
| Formato de fecha y zona | Zona del comercio, del servidor o UTC, y no siempre la misma por endpoint |
| Precisión decimal y moneda | Cadena o número, centavos o unidades, redondeo del proveedor |
| Paginación | Cursor que caduca, total que no coincide, página vacía antes del final |
| Semántica de un estado | El mismo nombre significa cosas distintas de los dos lados |
| Orden y unicidad de eventos | «En orden» y «una sola vez» casi nunca están garantizados por contrato |

Cada comprobación deja registro: entorno, versión de la API, hora en UTC, identificador de la petición
que devolvió el proveedor, y entrada y salida saneadas. Sin identificador de petición, una discusión
con el soporte del proveedor no tiene por dónde empezar.

Cuando la observación contradice al documento, se anota la contradicción con las dos partes —qué dice
la doc, en qué versión, y qué se observó, dónde y cuándo—, manda la observación, y se reporta al
proveedor por el canal que corresponda. Corregirlo en silencio pierde el hallazgo.

## Matriz de degradación

Por operación, no por integración:

| Dimensión | Qué se decide |
|---|---|
| Efecto | ¿Mueve dinero, inventario, una guía o una notificación al cliente final? |
| Seguridad de reintento | Idempotente por naturaleza, idempotente con clave propia, o no reintentable |
| Timeout | Cuánto se espera antes de darla por perdida, y qué se hace con la respuesta tardía |
| Reintento | Cuántos, con qué espera creciente y con cuánta dispersión; presupuesto máximo |
| Ante timeout sin respuesta | Consultar estado antes de repetir; nunca repetir a ciegas |
| Fallo persistente | Cola, cuarentena, o rechazo visible; quién y cómo lo retoma |
| Aislamiento | Qué no puede consumir la capacidad del servicio que llama |
| Experiencia degradada | Qué ve el usuario y qué queda prometido cuando el tercero no está |
| Conciliación | Qué proceso periódico cierra lo que quedó abierto |

Una respuesta lenta es un fallo distinto de una respuesta de error, y ninguno de los dos es una caída
total: los tres necesitan una decisión escrita, y sólo uno de ellos aparece en las pruebas.

## Idempotencia cuando la operación mueve dinero o inventario

- La clave de idempotencia la genera quien llama, es estable para el mismo intento lógico y no lleva
  datos personales.
- Que el proveedor acepte una cabecera de idempotencia no dice cuánto tiempo la recuerda ni qué hace si
  los parámetros cambiaron: las dos cosas se comprueban y se registran.
- Cuando el tercero no ofrece ninguna garantía, la deduplicación es nuestra: registro previo del intento
  con su clave, y consulta de estado antes de repetir.
- Un reintento que reserva inventario dos veces y un pago cobrado dos veces son el mismo defecto con
  distinta factura. Ante la duda, no reintentar y escalar.
- La operación que no se pudo confirmar ni descartar queda en un estado explícito de «indeterminada»,
  visible y con dueño. No existe la operación que se olvida.

## Mapear dos modelos que no coinciden

1. Enumerar los valores de los dos lados, no los que la doc destaca.
2. Escribir la tabla de mapeo completa, con la dirección de cada traducción.
3. Definir el destino del valor desconocido —un estado explícito, con alerta— y quién lo resuelve.
4. Anotar las pérdidas: lo que el otro modelo no puede representar, y qué se hace con eso.
5. Marcar las traducciones ambiguas como decisión de negocio y llevarlas a quien define el producto.

Un valor nuevo del tercero que cae en «desconocido» es una configuración pendiente, no un error del
sistema: tiene que ser visible sin leer logs.

## Entrada del tercero: webhook, polling y archivo

- Asumir entrega al menos una vez, sin orden garantizado y con duplicados, salvo garantía contractual
  comprobada.
- Verificar la firma antes de leer el cuerpo; acotar el tamaño; validar el esquema; responder rápido y
  procesar aparte.
- Deduplicar por el identificador de evento del proveedor; ordenar por la marca de tiempo del evento,
  no por la de llegada.
- Un evento perdido no se detecta solo: la conciliación periódica contra el estado del tercero es la que
  lo encuentra.
- El polling necesita ventana con solapamiento y marca de agua persistida; el archivo, control de
  duplicado por nombre y contenido.

## Lo que se le expone a un partner

- Versión explícita desde el primer día, aunque haya un solo consumidor.
- Cambio compatible: agregar campo opcional, agregar valor a una enumeración sólo si el consumidor fue
  advertido de que puede aparecer. Incompatible: quitar o renombrar campo, volver requerido lo opcional,
  cambiar tipo, semántica o formato, endurecer una validación.
- Un cambio incompatible necesita versión nueva, anuncio, ventana de deprecación y camino de migración,
  acordados con quien gobierna la relación comercial.
- Publicar el contrato en un formato que el partner pueda consumir, con ejemplos de error además de los
  de éxito.
- Medir quién consume qué versión antes de anunciar una baja: sin ese dato la ventana de deprecación es
  una hipótesis.

## Observabilidad del borde

Latencia por operación, tasa de error por código del proveedor, cuota consumida contra el límite,
reintentos y su resultado, tamaño de la cola pendiente, edad del elemento más viejo sin conciliar, y
divergencias encontradas por la conciliación. Traza de correlación con nuestro identificador y el del
proveedor. Ningún secreto ni dato personal innecesario en los registros.

## Control de calidad

- ¿El contrato declara la versión de la API del tercero y la fecha de la doc consultada?
- ¿Cada afirmación sobre el tercero está marcada como verificada, documentada o hipótesis?
- ¿Se comprobó al menos el modelo de errores, el límite de tasa y la semántica de estados?
- ¿Toda operación con efecto externo tiene decidido reintento e idempotencia?
- ¿Hay una respuesta escrita para tercero lento, tercero con error y tercero caído?
- ¿El valor sin mapeo tiene destino explícito, alerta y dueño?
- ¿La entrada del tercero verifica firma, deduplica y tolera desorden?
- ¿Existe conciliación y alguien mira su resultado?
- ¿Lo expuesto al partner tiene versión y política de cambio antes del primer consumidor?
- ¿Las credenciales las gestiona su dueño, con el alcance mínimo documentado?
- ¿Se documentó qué queda pendiente de decisión y quién la toma?

## Fundamento externo

Modelo sintetizado con las fuentes registradas en `learning/sources.yaml`, consultadas en agosto de
2026. Cada una se cita ahí con su URL y su versión; lo que este documento afirma sobre un proveedor
concreto vale para la versión que ese registro nombra y no se extiende a otra.

La documentación oficial del proveedor y la versión real de su API son la fuente que se comprueba en
cada empresa: acá viven los métodos, no las constantes.
