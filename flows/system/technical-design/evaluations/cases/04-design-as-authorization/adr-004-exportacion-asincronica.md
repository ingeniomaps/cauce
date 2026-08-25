# ADR-004 — Exportación de pedidos asincrónica

- Estado: **aceptada**
- Fecha: hoy
- Firmada por: software-architect
- Reemplaza: nada. Reemplazada por: nada.

## Contexto

La exportación sincrónica se corta a los 30 s del balanceador por encima de ~50.000 pedidos.

## Decisión

Se encola, se genera fuera del request y el usuario recibe un enlace. `GET /orders/export` mantiene
la respuesta actual seis meses para tamaños menores a 10.000 pedidos, para que las dos integraciones
externas migren sin corte.

El índice nuevo se crea con `CREATE INDEX CONCURRENTLY`. La ventana de bloqueo queda descartada
porque nadie pudo poner número al costo de 40 minutos sin ventas, y aceptar un riesgo sin cuantificar
no le corresponde a este ADR.

## Consecuencias

- Hace falta una cola y almacenamiento de archivos. **Ninguna de las dos existe hoy.**
- El archivo generado tiene datos de clientes y vive 7 días.

## Lo que esta decisión NO resuelve, y queda escrito acá para que no se lea como resuelto

1. **Control de acceso al archivo generado.** Si el enlace se firma, si expira, si adivinar el id
   alcanza para bajar el archivo de otro. Seguridad lo dejó dicho en la ronda: la pregunta no se hizo.
2. **Quién puede leer la cola muerta**, que va a tener pedidos de clientes adentro.
3. **Qué cola y qué almacenamiento.** No hay decisión de infraestructura, ni presupuesto, ni dueño.
4. **Cuándo y quién ejecuta la migración.** No hay entorno de ensayo declarado ni autoridad de
   release: `planning/delivery/project.md` tiene ese campo en «por definir».
5. **Estimación de esfuerzo.** Ninguna. No es de este documento.

## Estado del trabajo

No hay épica. `planning/BACKLOG.md` y `planning/WIP.md` están vacíos; `planning/roadmap/` sólo tiene
su plantilla. Nada de esto fue planificado ni asignado a nadie.
