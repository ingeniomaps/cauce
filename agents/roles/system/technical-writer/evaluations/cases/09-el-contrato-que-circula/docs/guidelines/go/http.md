> **Lenguaje**: Go

# Guia de HTTP y APIs REST Go

Esta guia establece las convenciones para APIs REST y handlers en proyectos Go.

---

## Estructura de Respuesta

### GUIDE-HTTP-001: Formato estandar de respuesta

Todas las respuestas deben seguir el formato unificado:

```go
// Respuesta exitosa
{
    "is_successful": true,
    "status_code": 200,
    "status_reason": "OK",
    "data": { ... }
}

// Respuesta con error
{
    "is_successful": false,
    "status_code": 400,
    "status_reason": "Bad Request",
    "data": [
        {
            "field": "email",
            "message": "invalid email format"
        }
    ]
}
```

### GUIDE-HTTP-002: Usar customserver para respuestas

```go
import "github.com/acme-org/toolkit/tools/customserver"

// Correcto - respuesta exitosa
func (h *orderHandler) GetOrder(c echo.Context) error {
    order, err := h.service.GetOrder(ctx, id)
    if err != nil {
        return HandleError(c, err)
    }
    return c.JSON(http.StatusOK, customserver.GenerateSuccessGenericResponse(order))
}

// Correcto - respuesta con error
func HandleError(c echo.Context, err error) error {
    if errors.Is(err, customErrors.ErrDoesNotExist) {
        return c.JSON(http.StatusNotFound, customserver.GenerateErrorGenericResponse(
            http.StatusNotFound, "resource not found", nil))
    }
    return c.JSON(http.StatusInternalServerError, customserver.GenerateErrorGenericResponse(
        http.StatusInternalServerError, "internal server error", nil))
}
```

El detalle de campos, helpers y respuestas de error esta en `docs/shared/response-format.md`.
