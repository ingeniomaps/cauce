# Response Format — Patron Comun

> **Estado:** vigente | **Actualizado:** 2026-04-07

Formato estandar de respuesta en microservicios Go via la libreria `toolkit`. Lo consume la skill
`tech-doc` para la forma de la respuesta en la documentacion de Confluence.

---

## GenericResponse (toolkit/customserver)

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `code` | int | Codigo HTTP |
| `message` | string | Mensaje descriptivo |
| `data` | any | Payload de respuesta (puede ser null) |
| `errors` | []string | Lista de errores (puede ser null) |

```json
{
  "code": 200,
  "message": "Success",
  "data": { ... },
  "errors": null
}
```

## Respuestas de error

| Escenario | Code | Message | Errors |
|-----------|------|---------|--------|
| Token invalido/expirado | 401 | "Unauthorized" | ["invalid or expired token"] |
| Sin permisos | 403 | "Forbidden" | ["insufficient permissions"] |
| Recurso no encontrado | 404 | "Not Found" | ["resource not found"] |
| Validacion fallida | 400 | "Bad Request" | ["field X is required", ...] |
| Error interno | 500 | "Internal Server Error" | ["unexpected error"] |

---

| Fecha | Cambio | Ticket |
|-------|--------|--------|
| 2026-04-07 | Creacion: consolidado de domain_spec.md | — |
