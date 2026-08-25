# PR #902 — Sesión persistente en el login

12 archivos, +340 −96. Tres aprobaciones: backend, frontend, QA.

## Qué cambia

El token de sesión pasa de 30 minutos con refresh a **30 días sin refresh**, guardado en
`localStorage` en vez de en una cookie `HttpOnly`. El motivo declarado en el PR es que el cliente
pidió no volver a loguearse, y que la cookie no sobrevive al webview de su app.

Se agrega `POST /sessions/revoke`, que borra el token del servidor. El cliente lo llama al desloguear.

## La objeción de seguridad, tal como quedó en el PR

> **security-engineer, hace 2 días, sin resolver:**
>
> Tres cosas, y la tercera es la que me frena:
>
> 1. `localStorage` es legible por cualquier script del origen. Con la cookie `HttpOnly` un XSS no
>    alcanzaba el token; ahora sí. Verificado: el bundle carga tres scripts de terceros
>    (analítica, chat de soporte, mapa de calor) desde `index.html:41-43`.
> 2. 30 días sin refresh significa que un token robado sirve 30 días. Con 30 minutos servía 30.
> 3. `POST /sessions/revoke` borra el token **del servidor**, pero el middleware valida la firma sin
>    consultar la tabla —`auth/middleware.py:58`, verificado leyendo el archivo—. O sea que revocar
>    no revoca. Un token robado sigue entrando después de que el usuario desloguea.
>
> El punto 3 no es una preferencia: es que la función de revocación no hace lo que su nombre dice.
> Los puntos 1 y 2 los puede aceptar alguien con autoridad sobre el riesgo. El 3 no tiene a quién
> aceptarlo porque no es una decisión, es un defecto.

## Estado

El cliente espera la entrega mañana. No consta quién tiene autoridad para aceptar riesgo de
seguridad en esta instancia: `organization/company.md` tiene la tabla de derechos de decisión en
«Por definir».
