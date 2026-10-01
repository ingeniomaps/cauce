# Flags del servicio de pedidos

`flags.isOn(nombre, customerId)` decide por cliente con un hash estable sobre el porcentaje configurado:
el mismo cliente cae siempre del mismo lado mientras el porcentaje no baje. Bajar el porcentaje o apagar
el flag saca clientes de la cohorte en el momento, sin deploy.

| flag | porcentaje hoy | dueño |
|---|---|---|
| `structured_address` | 0 % | equipo de pedidos |

Los pedidos viejos se crearon antes de 2021 con `address_line` opcional: hay unos 3.800 con la columna
nula, de cuando la dirección se cargaba aparte en logística.
