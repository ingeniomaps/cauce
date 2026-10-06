---
caso: 254
titulo: ops worktree no encuentra el repo cuando el servicio se llama como su raíz
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 254 — `ops worktree` falla con «no encontré el repositorio» en una instancia que declara una raíz por repositorio

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: el comando tiene salida a mano —cortar la rama con git—, pero es la pieza que el 251 quiere usar para que el
recorrido corte rama por tarea, y así no sirve en toda instancia.

## Resumen

El motor resuelve el repositorio de una tarea buscando `<raíz declarada>/<service>`. Si la instancia
declara una raíz por repositorio y la tarea nombra el servicio por ese mismo nombre —raíz `app`,
`service: app`—, busca `app/app`, no lo encuentra y dice que el repositorio no existe. Funciona sólo
cuando la raíz es la carpeta que contiene a los repos.

## Reproducción

En el banco de medición `sidecar`, que trae esa forma de fábrica: `workspaceRoots: [{ name: "app", path:
"app" }]` y una tarea `tarea-medida` con `(service: app)`.

```bash
cd "$(node engine/cli/ops.js bench sidecar --force)"
node tools/ops.js worktree planning tarea-medida
```

## Síntoma

```
no encontré el repositorio de app: revisá workspaceRoots en ops.config.json y que la ruta del servicio exista.
exit=2
```

`app` es un repositorio git propio y está en la ruta declarada.

## Causa raíz

`engine/core/repos.js:31-34`: `reposFor` filtra las raíces por
`fs.existsSync(path.join(root, service || '.'))`. Con la raíz ya apuntando al repo, `service` se le suma
otra vez.

Las dos formas están en uso. globex declara una sola raíz, `..`, y `service: account` resuelve
`../account`. **Acá decía «ahí anda», y era falso**: estaba afirmado por lectura y no corrido. Esa raíz es
una carpeta de repositorios y no un repositorio, y `reposFor` preguntaba por git en la raíz; el caso 263 lo
midió y lo arregló. initech declara `platform → ../platform` y sus tareas dicen `service: platform`:
por lectura da `../platform/platform`, que no existe. **En initech no se corrió**, es una instancia real.

`repoOf` usa la misma función, así que `check` cae ahí en su degradación —mirar sólo la fecha— sin avisar
que no encontró el repositorio.

## Fix propuesto

Que una raíz cuyo `name` o cuyo último tramo de `path` coincide con `service` resuelva a sí misma, además
de la búsqueda de hoy. Y que el mensaje diga qué rutas probó.

## Tradeoffs

- Una raíz `api` que además contiene una carpeta `api/` pasa a tener dos candidatos. Hoy gana la carpeta;
  hay que decidir cuál gana después, o `worktree` lo reporta como ambiguo.
- El banco `sidecar` cambia de resultado, y es lo que usan otras mediciones.

## Contexto de descubrimiento

Al validar el 251 el 2026-10-05, para saber si `ops worktree` era una opción real para cortar la rama de
cada tarea en sidecar.

## Relacionados

- 251 — el paso de Commit no corta rama y commitea en la rama viva.

## Cierre

**Resuelto en 0.101.0.** `reposFor` resuelve un servicio por ruta dentro de la raíz, como antes, y además
por el nombre declarado de la raíz o por el último tramo de su ruta.

### El recorrido de lo que este caso enumeró

- **Fix, que la raíz resuelva a sí misma — se hizo.**
- **Fix, que el mensaje diga qué rutas probó — se decidió que no.** Con la resolución arreglada, el mensaje
  queda para el servicio que no existe de ninguna forma, y ahí «revisá workspaceRoots» alcanza.
- **Tradeoff de la raíz `api` que además contiene `api/` — no hay ambigüedad.** Las dos formas caen en la
  misma raíz y dan el mismo repositorio. Con dos raíces que apuntan a repositorios distintos, `worktree`
  ya lo reportaba como ambiguo y lo sigue haciendo.
- **Tradeoff del banco `sidecar` — cambió, para bien**: ahora su propia tarea resuelve.
- **«`check` cae en su degradación sin avisar» — se fue con lo anterior**, porque usa la misma función.
  No se midió sobre `check` por separado.

### Qué se corrió

- **La reproducción del caso, antes y después**, en el banco `sidecar` recreado. Antes: «no encontré el
  repositorio de app», exit 2. Después:

  ```
  ✓ …/sidecar/app-tarea-medida  (task/tarea-medida)
  exit=0
  ```

  y `git worktree list` muestra el árbol nuevo en `task/tarea-medida`.
- **La prueba nueva vista en rojo** sin el arreglo, y **dos mutaciones en rojo** en una copia: quitar la
  coincidencia por nombre y quitar la coincidencia por último tramo.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: initech, que es la instancia real con esta forma.
