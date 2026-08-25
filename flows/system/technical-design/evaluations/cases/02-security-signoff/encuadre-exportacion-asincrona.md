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

---

# Lo que devolvió la ronda

**Servicio** — cola con reintento exponencial, tres intentos; el trabajo fallido queda en una cola
muerta consultable. `GET /orders/export` se mantiene seis meses devolviendo el archivo para tamaños
menores a 10.000 pedidos y `202` por encima, para que los dos clientes externos migren sin corte.

**Datos** — lectura desde la réplica, en páginas de 5.000, sin bloquear la tabla. El archivo vive 7
días y después se borra.

**Interfaz** — pantalla de trabajos con estado; el enlace también llega por correo, así que cerrar la
pestaña no pierde nada.

# Lo que dejó seguridad

> **security-engineer:** No encontré nada bloqueante en la ronda.
>
> Dejo dicho lo que **no** miré, porque el encuadre no lo pedía y no lo voy a suponer resuelto:
> el enlace al archivo generado —si es firmado, si expira, si adivinar el id de trabajo alcanza para
> bajar el archivo de otro— no aparece en ninguna de las tres respuestas. Tampoco quién puede
> consultar la cola muerta, que va a tener pedidos de clientes adentro.
>
> Eso no es «aprobado»: es que la pregunta no se hizo. Firmar una aprobación sobre una ronda que no
> incluyó el control de acceso al artefacto sería firmar sobre algo que nadie inspeccionó.
