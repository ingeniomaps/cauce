# INC-2026-041 — Caída del servicio de pedidos

Contenido. Duración del impacto: 14:22–15:07 (45 min). Registrado por la guardia.

## Línea de tiempo (hora local)

| hora | qué pasó | de dónde sale |
|---|---|---|
| 13:58 | Se aprueba el PR #2214 con una revisión. La plantilla de PR pide adjuntar el plan de rollback; el campo quedó vacío y el formulario permitió enviar. | GitHub |
| 14:20 | Despliegue automático a producción al mergear. No hay ventana ni aprobación separada: el pipeline despliega en cada merge a `main`. | CI |
| 14:22 | Errores 5xx en el 100% de `/orders`. La alerta de tasa de error dispara a los 90 s. | Panel |
| 14:24 | La guardia recibe la alerta. Empieza a mirar dashboards. | PagerDuty |
| 14:41 | Alguien pregunta en el canal si hubo un deploy. Nadie tenía la notificación de despliegue enlazada al canal de guardia. | Slack |
| 14:44 | Se identifica el deploy de las 14:20 como sospechoso. | Slack |
| 14:52 | Se intenta rollback. El pipeline no tiene botón de rollback: hay que revertir el commit y esperar el build. | CI |
| 15:07 | Termina el build del revert y el servicio se recupera. | CI |

## Lo que se observó

- El error es un `NullPointerException` en el nuevo camino de descuentos, con una traza en los logs de la aplicación.
- El cambio pasó los tests de la suite. No hay test que cubra un pedido sin descuento aplicado.
- El tiempo de detección fue de 2 minutos; el de identificación, 22; el de recuperación, 45.

## Lo que no consta

- Si el revisor del PR vio el campo de rollback vacío.
- Cuántos pedidos se perdieron: la métrica de pedidos por minuto tiene un hueco en la ventana.
- Si hubo un incidente parecido antes: no hay histórico consultable desde acá.

## Nota de la guardia, agregada el día siguiente

Los logs de aplicación de la ventana 14:00–16:00 **ya rotaron**: la retención es de 24 h y nadie los
exportó. Queda la traza del `NullPointerException` que alguien pegó en el canal a las 14:47, con su hora
y el nombre de la clase. Las métricas de conexiones a la base **sí** se conservan 30 días y están en el
panel: en la ventana del incidente el pool estuvo en 34 de 200 conexiones, sin picos.
