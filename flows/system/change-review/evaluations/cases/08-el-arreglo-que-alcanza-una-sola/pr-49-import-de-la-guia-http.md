# PR #49 — Import de `GUIDE-HTTP-002` al host nuevo

1 archivo, +1 −1. Sin aprobaciones todavía. Rama `task/DOC-2381-http-import`.

## Descripción del PR

`GUIDE-HTTP-002` todavía importa `customserver` desde `bitbucket.org/acme-legacy/toolkit`. La
migración a GitHub ya está hecha: 49 de los 51 `go.mod` del ecosistema importan la librería como
`github.com/acme-org/toolkit`. Con el host viejo el ejemplo no se puede copiar tal cual, y la skill
`tech-doc` lo copia literal a la documentación de cada servicio.

Cambio documental; no modifica código.

## El diff

```diff
--- a/docs/guidelines/go/http.md
+++ b/docs/guidelines/go/http.md
@@ -40,7 +40,7 @@ Todas las respuestas deben seguir el formato unificado:
 ### GUIDE-HTTP-002: Usar customserver para respuestas

 ```go
-import "bitbucket.org/acme-legacy/toolkit/tools/customserver"
+import "github.com/acme-org/toolkit/tools/customserver"

 // Correcto - respuesta exitosa
 func (h *orderHandler) GetOrder(c echo.Context) error {
```

## El árbol de guías, como queda en la rama

Extractos de los archivos de `docs/` que mencionan la librería. Los números son los de línea en el
archivo completo.

`docs/guidelines/go/http.md` (después del PR):

```
 43  import "github.com/acme-org/toolkit/tools/customserver"
```

`docs/guidelines/go/database.md`:

```
 22  ### GUIDE-DB-001: Importar QueryBuilder
 23
 24  ```go
 25  import queryBuilder "bitbucket.org/acme-legacy/toolkit/tools/querybuilder"
 26  ```
...
438  Usar `libPgx.ScanRows` en lugar de loops manuales `rows.Next() + rows.Scan()`.
439
440  ```go
441  import libPgx "bitbucket.org/acme-legacy/toolkit/tools/sqlconnection/pgx"
...
860  import (
861      "errors"
862      "github.com/jackc/pgx/v5"
863      "bitbucket.org/acme-legacy/project/pkg/kit/customErrors"
864  )
...
909  ```go
910  import "bitbucket.org/acme-legacy/toolkit/tools/transaction"
...
1247  - QueryBuilder: `bitbucket.org/acme-legacy/toolkit/tools/querybuilder`
1248  - CursorBuilder: `bitbucket.org/acme-legacy/toolkit/tools/querybuilder` (NewCursorBuilder)
1249  - Transaction: `bitbucket.org/acme-legacy/toolkit/tools/transaction`
```

`docs/guidelines/go/errors.md`:

```
 33  Usar el paquete `customErrors` para errores de negocio estandarizados:
 34
 35  ```go
 36  import "bitbucket.org/acme-legacy/project/pkg/kit/customErrors"
...
 69  import (
 70      "errors"
 71
 72      "github.com/jackc/pgx/v5"
 73      "bitbucket.org/acme-legacy/project/pkg/kit/customErrors"
 74  )
```

`docs/guidelines/go/standards.md`:

```
 29  ### STD-GO-002: Orden de imports
 30
 31  ```go
 32  import (
 33      "context"
 34      "net/http"
 35
 36      "bitbucket.org/acme-legacy/my-project/internal/model"
 37      "bitbucket.org/acme-legacy/my-project/pkg/kit/enums"
 38
 39      "github.com/labstack/echo/v4"
 40      "github.com/rs/zerolog/log"
 41  )
...
 77  import (
 78      "database/sql"
 79      "os"
 80
 81      "bitbucket.org/acme-legacy/distribution-companies/distribution_companies/service"
 82      "bitbucket.org/acme-legacy/distribution-companies/pkg/kit/enums"
 83
 84      "bitbucket.org/acme-legacy/toolkit/tools/customserver"
 85      "github.com/labstack/echo/v4"
```

`docs/guidelines/go/testing.md`:

```
127  import (
128      "context"
129
130      "github.com/stretchr/testify/mock"
131      "bitbucket.org/acme-legacy/project/internal/model"
132  )
...
439  import (
440      mockTransaction "bitbucket.org/acme-legacy/toolkit/tools/mocks/transaction"
441  )
```

`docs/domains/libraries/README.md`:

```
  6  **Proyecto**: `bitbucket.org/acme-legacy/toolkit`
  7  **Stack**: Go 1.23, Echo v4, pgx v5, Redis, RabbitMQ
  8
  9  ## Instalacion
 10
 11  ```bash
 12  git config --global --add url."git@bitbucket.org:".insteadOf "https://bitbucket.org/"
 13  go env -w GOPRIVATE="bitbucket.org/acme-legacy/*"
 14  go get -u bitbucket.org/acme-legacy/toolkit@latest
 15  ```
 16
 17  Import: `import "bitbucket.org/acme-legacy/toolkit/tools/{paquete}"`
```

## Lo que hay en el repositorio de la librería

`go.mod`:

```
module github.com/acme-org/toolkit

go 1.25
```

`.golangci.yml` de un servicio ya migrado:

```yaml
linters-settings:
  gci:
    sections:
      - standard
      - prefix(github.com/acme-org/orders-service)
      - default
```
