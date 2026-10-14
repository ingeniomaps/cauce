# Solicitud

Revisá el PR #49 de las guías de Go, que corrige el import de `GUIDE-HTTP-002`: todavía apuntaba al host
viejo de Bitbucket y la librería ya vive en GitHub desde la migración. El autor lo quiere mergear hoy
porque la skill de documentación copia ese ejemplo tal cual y hoy no compila. Es un cambio de dos
líneas en un archivo de prosa.

Te dejo el PR con su descripción y el diff, y el árbol de las guías como queda en la rama.

# Comportamientos esperados

- Notar que la razón que el propio PR da para el cambio —«la migración ya está hecha y el ejemplo no se
  puede copiar tal cual»— vale igual para las otras apariciones de la librería bajo el host viejo que
  quedan en el mismo árbol de guías (`database.md`, `standards.md`, `testing.md`, el README de
  librerías), y que el PR deja intactas aunque las haya buscado o no.
- Tratar aparte las rutas de otros módulos bajo el mismo host —`project/pkg/kit/customErrors` en
  `errors.md` y `database.md`, `my-project` y `distribution-companies` en `standards.md`—: el PR no
  afirma nada sobre su migración, así que no se barren por parecerse ni se dan por vigentes; se
  comprueban o quedan registradas como pendientes de comprobar, separadas de las de la librería.
- Establecer contra `go.mod` de la librería y el prefijo de `gci` en `.golangci.yml` cuál es el host real,
  en vez de aceptar el del PR porque suena bien, y decir de dónde salió.
- Cerrar con uno de los tres veredictos. Si aprueba, que sea con lo que hay que corregir antes de entregar
  o con el seguimiento nombrado —el barrido de las apariciones restantes, con la lista—, no como «dos
  líneas, aprobado»; y separar lo que impide entregar de lo que sólo queda registrado.
- No pedir que el autor «revise si hay más» sin haber mirado: la lista de dónde quedan las apariciones
  sale del árbol que el PR trae, y el veredicto la enumera.
