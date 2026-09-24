---
caso: 197
titulo: El guard de verify toma cualquier `.yaml` staged bajo `api/`, `openapi/` o `spec/` por una especificación OpenAPI, y frena un `sqlc.yaml` o un `docker-compose.yml` pidiendo código regenerado
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 197 — Un `api/sqlc.yaml` se frena como si fuera una especificación OpenAPI

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. El guard reconoce una fuente OpenAPI por la
carpeta y la extensión, sin mirar el contenido. Así, cualquier configuración YAML que viva bajo `api/`,
`openapi/` o `spec/` exige un generado que no existe.

## Resumen

`verify()` en `engine/hooks/verify.js` decide si cambió una especificación con esto:

```js
const changedOpenApi = staged.some((file) => /^(?:openapi|api|spec)(?:\/.*)?\/[^/]+\.ya?ml$/i.test(file))  // :176
  || staged.some((file) => /^(?:openapi|swagger)\.ya?ml$/i.test(file))                                  // :177
```

Si no hay además un `*generated.*` o `*.gen.*` staged (`:179`), frena (`:186`, con el mensaje en `:187`).

La primera línea acepta **todo** `.yaml` o `.yml` que cuelgue de `api/`, `openapi/` o `spec/`, a
cualquier profundidad. Una carpeta `api/` es donde un monorepo pone su servicio. Ahí viven también un
`sqlc.yaml`, un `docker-compose.yml`, un `.golangci.yml` o la config de CI, y cualquiera de ellos que se
stagee recibe «Cambió una fuente OpenAPI/Swagger… Ejecuta el generador». No hay generador que ejecutar,
así que la única salida es aprobar el índice a mano.

Es el mismo patrón que el 187: el guard adivina por el layout algo que el archivo dice por sí solo. Una
especificación OpenAPI lo declara en su primera clave (`openapi: 3.x` o `swagger: "2.0"`), y el guard no
la lee.

## Reproducción

Desde un directorio vacío. No hace falta ningún generador: el guard mira sólo las rutas del índice.
`<cauce>` es la raíz de este repositorio.

```bash
S=$(mktemp -d)
cat > "$S/run.js" <<'EOF'
const { verify } = require('<cauce>/engine/hooks/verify.js')
const dir = process.argv[2]
try { verify({ tool_input: { command: 'git commit -m x' }, cwd: dir }); console.log('PASA (verify no bloqueó)') }
catch (e) { console.log(e.blocked ? 'BLOQUEADO: ' + e.message.split('\n')[0] : 'ERROR: ' + e.stack) }
EOF
mk() {  # $1 nombre del repo, el resto: rutas a crear y stagear
  d="$S/$1"; shift; mkdir -p "$d/planning"; git -C "$d" init -q
  echo '{"mode":"company"}' > "$d/ops.config.json"
  for f in "$@"; do mkdir -p "$d/$(dirname "$f")"; echo 'version: "2"' > "$d/$f"; git -C "$d" add -- "$f"; done
  echo "== $(basename "$d"): $(git -C "$d" diff --cached --name-only | tr '\n' ' ')"
  (cd "$d" && env -u CLAUDE_PROJECT_DIR -u OPS_ROOT node "$S/run.js" "$d")
}
mk sqlc-en-api       api/sqlc.yaml
mk compose-en-api    api/docker-compose.yml
mk ci-en-spec        spec/fixtures/config.yaml
mk sqlc-en-backend   backend/sqlc.yaml
mk openapi-de-verdad api/openapi.yaml
```

Ninguno de los cinco archivos es una especificación: todos contienen `version: "2"`. Sólo el último se
llama como una.

## Síntoma

Salida real del script, corrida el 2026-09-23 contra el motor del repositorio principal en la rama
`fix/cases-185-196`, con Node v24.18.0:

```
== sqlc-en-api: api/sqlc.yaml
BLOQUEADO: Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y stagea su salida.
== compose-en-api: api/docker-compose.yml
BLOQUEADO: Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y stagea su salida.
== ci-en-spec: spec/fixtures/config.yaml
BLOQUEADO: Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y stagea su salida.
== sqlc-en-backend: backend/sqlc.yaml
PASA (verify no bloqueó)
== openapi-de-verdad: api/openapi.yaml
BLOQUEADO: Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y stagea su salida.
```

El mismo `sqlc.yaml` frena bajo `api/` y pasa bajo `backend/`: lo único que decide es el nombre de la
carpeta. El quinto frena aunque su contenido no sea OpenAPI, así que tampoco el nombre del archivo
distingue nada.

## Causa raíz

- **`engine/hooks/verify.js:176`**, `changedOpenApi`: `^(?:openapi|api|spec)(?:\/.*)?\/[^/]+\.ya?ml$`
  acepta cualquier nombre de archivo YAML bajo esas tres carpetas. Sirve para `openapi/`, cuyo nombre ya
  dice qué contiene. Para `api/` y `spec/` es demasiado amplio: son carpetas de propósito general.
- **`engine/hooks/verify.js:186`**: el bloqueo depende sólo de `changedOpenApi` y `hasApiGenerated`, así
  que lo de `:176` decide todo.
- **Las pruebas sólo stagean especificaciones de verdad**: `test/hooks/commit.test.js:28-30` y
  `test/hooks/chat-effects.test.js:104-105` escriben `openapi/api.yaml` con `openapi: 3.0.0`. Ninguna
  stagea un YAML que no sea OpenAPI bajo esas carpetas, y por eso nada se puso rojo.

Contrastado el 2026-09-23 con `sed -n 176,190p engine/hooks/verify.js` sobre el repositorio principal,
con el arreglo del 187 y el 192 ya integrado.

## Fix propuesto

1. **Mirar la primera clave del archivo staged.** `git show :<ruta>` devuelve el blob del índice, sin
   tocar el árbol. Una especificación OpenAPI 3 empieza con `openapi:` y una Swagger 2 con `swagger:`,
   así que basta un `/^(?:openapi|swagger)\s*:/m` sobre las primeras líneas. La carpeta queda como filtro
   barato previo, para no leer cada YAML del commit:

   ```diff
   -  const changedOpenApi = staged.some((file) => /^(?:openapi|api|spec)(?:\/.*)?\/[^/]+\.ya?ml$/i.test(file))
   -    || staged.some((file) => /^(?:openapi|swagger)\.ya?ml$/i.test(file))
   +  const changedOpenApi = staged.some((file) => OPENAPI_CANDIDATE.test(file) && declaresOpenApi(dir, file))
   ```

   `declaresOpenApi` lee el blob con `git show` y busca la clave. Si git no contesta, devuelve `true`:
   el guard no afloja cuando no pudo mirar, igual que `usesSqlc` en el arreglo del 192.

2. **Si leer contenido se descarta, excluir por nombre las configs conocidas** (`sqlc.*`,
   `docker-compose*`, `.golangci*`). Es más barato y peor: es una lista de lo que no es OpenAPI, que
   envejece con cada herramienta nueva, y R27 pide lo contrario.

## Tradeoffs

- **Una especificación partida en fragmentos no dispara con el punto 1.** Un `api/paths/users.yaml`
  referenciado por `$ref` no tiene la clave `openapi:`, así que cambiarlo solo no pediría el generado,
  y hoy sí lo pide. Una salida es disparar también cuando el fragmento cuelga de una carpeta que tiene
  una raíz declarada en el índice. Hay que decidir si vale la complejidad o si se acepta el hueco.
- **Leer el blob cuesta un `git show` por candidato.** Con el filtro de carpeta son pocos por commit.
- **JSON queda afuera igual que hoy.** Una especificación en `openapi.json` no dispara ni antes ni
  después. Es otra ampliación y no la pide este caso.

## Prioridad

Media. Frena commits correctos, como el 187, pero sólo cuando hay un YAML que no es OpenAPI bajo
`api/` o `spec/`. Es un layout común en monorepos Go —`api/` para el servicio, con su `sqlc.yaml` y su
compose adentro—, y ahí salta en cada commit que toque esa config. La salida es aprobar el índice a
mano, lo que el 187 describe como la forma de acostumbrarse a aprobar bloqueos.

## Contexto de descubrimiento

Escribiendo la tabla de pruebas del arreglo del 187 y el 192 (2026-09-23). La fila del monorepo stageaba
`api/sqlc.yaml` junto a la consulta y el guard frenó por OpenAPI antes de llegar al chequeo de sqlc. La
fila se movió a `backend/` para no mezclar los dos defectos, y éste salió como caso propio.

## Relacionados

- **187**: la misma familia, que es adivinar el layout en vez de leer lo que el archivo declara. Allá
  para el generado de sqlc; acá para la fuente OpenAPI.
- **192**: su arreglo introdujo el `sqlc.yaml` como señal, y esa señal es justo lo que este guard toma
  por una especificación cuando vive bajo `api/`.

## Cierre

**Resuelto en 0.99.0, por el punto 1 del fix.** Recorriendo lo que enumeró:

- **Fix 1, mirar la primera clave del archivo staged → se hizo.** `declaresOpenApi` (`engine/hooks/verify.js`)
  lee el blob con `git show :<ruta>` y busca `openapi:` o `swagger:` en los primeros 4 KB. La carpeta quedó
  como filtro previo (`OPENAPI_CANDIDATE`), así que sólo se lee lo que ya era candidato.
- **Fix 2, excluir por nombre las configs conocidas → se decidió que no**, por lo que el propio caso dice: es
  una lista de lo que no es OpenAPI y envejece con cada herramienta nueva (R27).
- **Tradeoff de la especificación partida en fragmentos → se resolvió, no se aceptó el hueco.** Un candidato
  que no declara nada cuenta si su carpeta de primer nivel tiene en el índice un `.yaml` que sí declare
  `openapi:` o `swagger:` (`changedOpenApiSpec`). Así `api/paths/users.yaml` sigue pidiendo el generado junto a
  un `api/openapi.yaml`, y `api/sqlc.yaml` no lo pide en una carpeta sin especificación. Lo que queda: en una
  carpeta **mixta** —especificación y config de sqlc juntas en `api/`— cambiar la config sigue disparando.
  Separar eso pediría resolver los `$ref`, y no lo vale.
- **Tradeoff del costo de `git show` → aceptado**: un `show` por candidato, y un `ls-files` por carpeta sólo si
  ningún candidato declaró nada.
- **Tradeoff de JSON → queda igual que antes**, como decía el caso: una especificación en `openapi.json` no
  dispara ni antes ni después.

**Lo que el caso no preveía: un archivo borrado.** Figura en el índice como cambio y `git show :<ruta>` ya no
lo encuentra. Leído así habría disparado siempre, también al borrar una config de sqlc. Se lee lo que era en
`HEAD`: borrar una especificación dispara, borrar la config de sqlc no. Si ninguno de los dos lo tiene, el
guard dispara —no pudo mirar, no afloja—; esa rama es inobservable, porque un archivo del índice está en uno
de los dos o `stagedForCommit` ya frenó antes, igual que el `ls-files` fallido del 187.

### Qué se corrió

- **La reproducción del caso, tal como está escrita, contra el guard arreglado** (2026-09-23):

  ```
  == sqlc-en-api: api/sqlc.yaml               PASA (verify no bloqueó)
  == compose-en-api: api/docker-compose.yml   PASA (verify no bloqueó)
  == ci-en-spec: spec/fixtures/config.yaml    PASA (verify no bloqueó)
  == sqlc-en-backend: backend/sqlc.yaml       PASA (verify no bloqueó)
  == openapi-de-verdad: api/openapi.yaml      PASA (verify no bloqueó)
  --- control: api/openapi.yaml con «openapi: 3.0.0»
  BLOQUEADO: Cambió una fuente OpenAPI/Swagger sin incluir código regenerado…
  ```

  El quinto del caso contiene `version: "2"`: se llama como una especificación y no lo es, y ahora pasa.
- **La tabla nueva en `test/hooks/verify.test.js`**, diez filas, con las tres del caso en rojo sobre el código
  anterior. **Cuatro mutaciones en una copia del árbol**: todo `.yaml` como especificación (5 en rojo), sin
  fragmentos (3), sin `HEAD` para lo borrado (2), y el último `return` aflojando, que sobrevive por lo dicho
  arriba. Una quinta, sin `--full-name` en el `ls-files`, sobrevivía también: `git` resuelve `:../ruta`
  relativo al directorio, así que la bandera sobraba y se quitó.
- `npm run ci`, exit 0, 992 pruebas.

