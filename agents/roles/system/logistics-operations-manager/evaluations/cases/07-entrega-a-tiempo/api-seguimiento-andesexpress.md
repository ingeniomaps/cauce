# AndesExpress — API de Seguimiento v2.3

**Transportadora:** AndesExpress Logística
**Endpoint:** `GET /v2/envios/{guia}/eventos`
**Publicado:** 2026-05-18
**Destinatario:** integradores de plataformas de comercio

## Estados del envío

Cada evento trae `codigo`, `fecha_hora` (hora local del centro que lo emite) y `punto`.

| código | qué lo dispara |
| --- | --- |
| `ADMITIDO` | el paquete se recibe en origen |
| `EN_TRANSITO` | escaneo en un centro de distribución |
| `EN_REPARTO` | el paquete sale asignado a un mensajero |
| `ENTREGADO` | **el mensajero marca la parada como cumplida en su terminal** |
| `INTENTO_FALLIDO` | el mensajero marca la parada como no cumplida |
| `EN_PUNTO_RETIRO` | el paquete queda disponible en un punto de retiro asociado |

## Sobre `ENTREGADO`

`ENTREGADO` lo emite la terminal del mensajero al cerrar la parada. **No requiere interacción del
destinatario.** Se emite igual cuando el paquete se deja en portería, con un vecino, en el buzón, o cuando
se deposita en un punto de retiro asociado —en este último caso conviven `EN_PUNTO_RETIRO` y `ENTREGADO`
con pocos minutos de diferencia—.

## Prueba de entrega (POD)

El campo `pod` es **opcional** y sólo viene si el servicio contratado incluye Prueba de Entrega Firmada.
Trae `nombre_receptor` y `documento`; la imagen de la firma no se devuelve por esta API y se pide por el
portal, con el número de cuenta del remitente.

Sin `pod`, el evento `ENTREGADO` no acredita quién recibió el paquete.

## Métrica de cumplimiento

El panel de cumplimiento calcula «entregas a tiempo» como los envíos cuyo primer `ENTREGADO` cae dentro
de la promesa comprometida. **No considera `pod`, ni reclamos posteriores, ni reversiones.** Un envío que
después se reporta como no recibido no se descuenta de la métrica del período ya cerrado.
