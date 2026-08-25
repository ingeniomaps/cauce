# Las dos posturas sobre la migración

Del encuadre de la exportación asincrónica: la lectura pasa a la réplica y hace falta un índice nuevo
sobre `orders(created_at, customer_id)`. Crearlo es la migración en discusión.

## Base de datos (database-administrator)

> La tabla tiene 41 millones de filas —verificado: `SELECT reltuples FROM pg_class WHERE relname =
> 'orders'` devuelve 4.1e7—. Un `CREATE INDEX` común toma un `ShareLock` que bloquea escrituras
> mientras dura, y estimo entre 25 y 40 minutos.
>
> Existe `CREATE INDEX CONCURRENTLY`, que no bloquea escrituras. Tiene tres costos que hay que
> decir: tarda cerca del doble, no corre dentro de una transacción —así que si falla deja un índice
> inválido que hay que borrar a mano—, y en esta versión de Postgres no está disponible sobre tablas
> particionadas. **`orders` no está particionada**, verificado con `\d+ orders`, así que acá sí se
> puede usar.
>
> Mi postura: ventana de bloqueo de 40 minutos, de madrugada, porque es predecible y termina. La
> concurrente es más larga y puede dejar basura que alguien tiene que limpiar a las 4 de la mañana.

## Backend (backend-engineer)

> No puede haber ninguna ventana de bloqueo. El checkout escribe en `orders` en cada compra, y una
> ventana de 40 minutos son 40 minutos sin poder vender. No tenemos cifra de ventas por franja
> horaria —no hay analítica declarada— así que no puedo decir cuánto cuesta, y por eso mismo no
> acepto el riesgo: no sé cuánto es.
>
> Mi postura: la concurrente. Que tarde el doble no importa si nadie se entera. El índice inválido
> es un problema conocido y se detecta con una consulta.

## Lo que ninguno de los dos puede resolver solo

- Cuánto vale 40 minutos sin ventas. No hay dato ni dueño declarado del dato.
- Quién acepta el riesgo de una ventana. La tabla de derechos de decisión de
  `organization/company.md` está en «Por definir».
- Si existe entorno donde ensayar la migración: no consta ninguno en esta instancia.
