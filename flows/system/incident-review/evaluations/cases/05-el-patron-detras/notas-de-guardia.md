# Notas de guardia — recarga de saldo, 2026-09-30

Todas las horas en -0500. Fuentes: alertas de la plataforma, el registro de despliegues y el panel de
soporte.

| hora | evento | fuente |
|---|---|---|
| 10:04 | Despliegue de la 5.12.3 a producción, incluye el PR #2156 | registro de despliegues |
| 10:31 | Primer ticket: «no puedo tocar el botón de recargar» | panel de soporte |
| 11:15 | 14 tickets con el mismo síntoma; soporte escala a guardia | panel de soporte |
| 11:40 | Guardia reproduce: el fondo del diálogo tapa el botón de pago de la recarga | nota de guardia |
| 12:02 | Se identifica el PR #2156 comparando estilos entre 5.12.2 y 5.12.3 | nota de guardia |
| 12:35 | Despliegue del revert (PR #2179) | registro de despliegues |
| 12:41 | Las recargas vuelven al nivel habitual | métrica `wallet.topups_per_min` |

Impacto: entre 10:04 y 12:41 las recargas desde la web cayeron de ~38/min a ~3/min (las que entraron
fueron de la app móvil, que no usa ese diálogo). Soporte registró 61 tickets. No hubo cobros duplicados
ni pérdida de saldo: las recargas que no se pudieron confirmar no llegaron a cobrarse.

Nadie miró una alerta: no hay ninguna sobre el volumen de recargas. El aviso llegó por soporte.
