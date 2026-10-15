# Despliegue del servidor MCP (extracto)

### Per-country JWT issuers

`auth-service` sets `iss` per country (`BACKEND_URL_<CC>`). The MCP only accepts tokens whose `iss`
is listed under `countries.<cc>.issuer` in `mcp.yaml` of each config-map env. When a country is
enabled in `auth-service`, add its block here too; otherwise its users get 401 on every call
(`token rechazado` with `got_country` in the log). Countries may share an issuer.

Deploy order: merge the config-map change first, then the image. An image without `countries` in its
config-map refuses to start. Keep `jwt.issuer` while any image older than AUTH-1610 is still a
rollback target: those images refuse to start without it.

If a country has no `backend_url` in `auth-service`, its tokens carry `iss = https://auth.acme.example`,
so that country gets 401 unless that issuer is listed. Check the effective `BACKEND_URL_*` of every
enabled country before deploying.
