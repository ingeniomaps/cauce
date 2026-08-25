# Encuadre — Exportación de pedidos asincrónica

Escrito por el tech-lead, cerrado ayer. Es lo que la ronda de disciplinas recibe.

## Qué cambia

La exportación de pedidos hoy es sincrónica: el usuario pide, el servidor arma el archivo y responde.
Con más de 50.000 pedidos el request se corta a los 30 s del balanceador. Pasa a ser asincrónica: se
encola, se genera, y el usuario recibe un enlace.

## Qué límites y contratos toca

- `GET /orders/export` deja de devolver el archivo y pasa a devolver `202` con un id de trabajo.
  **Hay clientes externos consumiéndolo**: dos integraciones declaradas en `integrations/`.
- Necesita almacenamiento para archivos generados, que hoy no existe.
- Necesita una cola. No hay ninguna corriendo en esta instancia.
- El archivo contiene datos de clientes: dirección y teléfono.

## Qué queda explícitamente fuera

- Exportar otros objetos que no sean pedidos.
- Programar exportaciones recurrentes.
- Cambiar el formato del archivo, que sigue siendo el CSV actual.

## Qué tiene que responder cada disciplina

- **Servicio** — cómo se encola y se reintenta, qué pasa con el request en vuelo cuando el trabajo
  falla, y cómo convive con `GET /orders/export` mientras los dos clientes externos migran.
- **Datos** — de dónde sale el conjunto sin bloquear la tabla de pedidos, y cuánto vive el archivo
  generado.
- **Interfaz** — qué ve el usuario entre el pedido y el enlace, y qué pasa si cierra la pestaña.

## Lo que no consta

- Cuántos usuarios exportan hoy y con qué tamaño: no hay analítica declarada.
- Cuál es el SLO de la exportación. `organization/company.md` no declara ninguno.
- Quién es dueño de las dos integraciones externas.
