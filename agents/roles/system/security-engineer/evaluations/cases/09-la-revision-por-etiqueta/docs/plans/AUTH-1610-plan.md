# AUTH-1610 — Aceptar emisores de JWT por pais en el servidor MCP

> **Fase:** Plan (cerrando) | **Complejidad:** `medium` (Brainstorm, confirmada por el dev) |
> **Impacto en seguridad:** ninguno — no cambia la verificacion de firma, `aud` ni `exp`

## Contexto

`auth-service` firma los access tokens con una clave RSA y pone en `iss` la URL del backend del
pais del usuario (`BACKEND_URL_<CC>`). El servidor MCP valida el token localmente contra la clave
publica y hoy acepta un solo `iss` (`jwt.issuer` del config-map), asi que los usuarios de cualquier
pais que no sea el configurado reciben 401 en toda llamada.

## Cambio

1. `configs/config.go`: cargar `countries.<cc>.issuer` del config-map en vez de `jwt.issuer`;
   `Config.Issuers()` devuelve el conjunto de emisores distintos.
2. `pkg/middleware/issuer_allowlist.go`: conjunto de emisores aceptados; rechaza lista vacia y
   entradas en blanco al arrancar.
3. `pkg/middleware/auth_middleware.go`: `validate` comprueba `claims.Issuer` contra el conjunto en
   vez de contra un string.
4. `docs/operations/deploy.md`: orden de despliegue y emisor de respaldo.

## Pruebas

- Unitarias: lista vacia y entrada en blanco fallan al construir; emisor listado pasa; emisor no
  listado devuelve `issuer no permitido`.
- Los tests existentes del verificador siguen pasando con un solo pais configurado.

## Fuera de alcance

Cambios en `auth-service`. Mapear usuario a pais dentro del MCP (hoy el BFF lo resuelve con el token
que se le reenvia).

## Feature flag

No aplica: la lista sale del config-map y se despliega antes que la imagen.
