---
caso: 263
titulo: ops line deja la carpeta de la línea sin los repos cuando la raíz es la carpeta de sesión
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 263 — `ops line` arma una carpeta de línea sin producto cuando una raíz declarada es la carpeta que contiene a la instancia

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada de lo que ya funciona, pero deja sin uso la separación de líneas de la 0.100.0 en
toda instancia sidecar que declara como raíz la carpeta de sesión entera, que es la forma de un monorepo de repos.

## Resumen

En sidecar, `ops line <raíz> <nombre>` crea `<carpeta>-<nombre>/` y enlaza ahí cada `workspaceRoots[].path`. Si
una raíz es `..` —la carpeta de sesión, con un repo por servicio adentro—, no enlaza nada: la carpeta de la línea
queda con el worktree de la instancia y sin ningún repo de producto. Tampoco viaja lo que la sesión lee de esa
carpeta y no es una raíz.

## Reproducción

Leído en el código de la 0.100.0 instalada; **no se ejecutó**, porque crear la carpeta habría dejado una línea
inservible. Instancia: `acme-ops`, sidecar, dentro de `servers/`, con:

```json
"workspaceRoots": [{ "path": ".." }, { "path": "../../globex" }]
```

`servers/` no es un repositorio: contiene una carpeta por servicio (`backend-auth/`, `admin/`, …), cada una con
su git, y además el `CLAUDE.md` de la sesión y `evidence/`.

## Síntoma

Lo que `node tools/ops.js line . admin` dejaría, siguiendo `engine/cli/lines.js`:

```
servers-admin/
  acme-ops/          worktree en line/admin
  .claude/           runners instalados
                     (ningún servicio, ningún CLAUDE.md)
```

Una tarea con `service: admin` no resuelve su repositorio desde esa carpeta.

## Causa raíz

`engine/cli/lines.js`, en `line()`:

```js
const linked = (config.workspaceRoots || []).map((one) => one.path || '').filter(Boolean)
  .filter((relative) => linkIfMissing(path.resolve(where.ops, relative), path.resolve(root, relative)))
```

- Con `..`, el destino `path.resolve(where.ops, '..')` es la propia carpeta de la línea, que `git worktree add`
  ya creó. `linkIfMissing` ve que existe y no enlaza.
- Con `../../globex`, el destino sale de la carpeta de la línea y cae en el original, que también existe.

`linkIfMissing` enlaza una raíz entera o nada: no contempla una raíz que es un contenedor de repos.

## Fix propuesto

Cuando el destino de una raíz es la carpeta de la línea —o un ancestro de ella—, enlazar **sus hijos** en vez de
la raíz: cada entrada de la carpeta original que no exista en la de la línea, salvo la instancia y la
configuración de los runners. Con eso viajan los repos de servicio y también los archivos de la sesión.

```js
function linkChildren(home, original, skip) {
  return fs.readdirSync(original).filter((name) => !skip.has(name))
    .filter((name) => linkIfMissing(path.join(home, name), path.join(original, name)))
}
```

`skip` lleva el nombre de la instancia y los directorios de configuración de cada runner (`.claude`, `.codex`,
`.gemini`), que la línea instala para sí.

Aparte, y sin código: `delivery/teamwork.md` debería decir qué no viaja a la carpeta de una línea porque no es
de Cauce. La memoria de Claude Code va por carpeta de sesión, así que una línea nueva arranca sin la de la
carpeta original.

## Tradeoffs

- Enlazar hijos trae también lo que no es producto: notas, carpetas sueltas, otros worktrees. Es lo que una
  sesión abierta en la carpeta original ya ve, así que no agrega alcance; sí agrega ruido.
- Un archivo de sesión enlazado, como el `CLAUDE.md`, lo editan las dos líneas a la vez. Para un archivo que es
  de la carpeta y no de una rama, es lo correcto.
- La alternativa, declarar cada servicio como raíz propia, lo resuelve sin tocar Cauce, pero obliga a mantener
  una lista de más de veinte raíces y cambia lo que `check` y los guards de límites consideran raíz.

## Contexto de descubrimiento

Sesión del 2026-10-05 en `acme-ops`, con dos líneas (`auth` y `admin`) sobre la misma carpeta de sesión. El
loop de una recibía las tareas de la otra; se actualizó a la 0.100.0 para usar `line:` y `ops line`, y al leer
el comando antes de correrlo apareció que la carpeta no iba a servir.

Dos cosas más frenan la adopción ahí y **no son de Cauce**: las ramas de línea se llaman `work/<persona>-<línea>`
y no `line/<nombre>`, y las herramientas propias de la instancia leen sólo `BACKLOG.md`.

## Relacionados

- 218 — una línea de trabajo, su propia carpeta de sesión.
- 239 — qué trabajo es de qué línea.

## Cierre

**Resuelto en 0.101.0**, con el fix que el caso proponía y uno más que apareció al correrlo.

### El recorrido de lo que este caso enumeró

- **«No se ejecutó» — se ejecutó**, en un banco con esa forma: una carpeta `servers/` que no es un
  repositorio, con la instancia y dos servicios adentro, cada uno con su git, y `workspaceRoots: ['..',
  '../../externo']`. La carpeta de la línea quedó como el Síntoma predecía: sólo el worktree de la instancia.
- **Fix, enlazar los hijos — se hizo.** Con una diferencia: la instancia no hace falta saltearla, porque el
  worktree ya está en su lugar. Sí se saltea la configuración de todo runner, también la del que la
  instancia no tiene instalado.
- **Fix, `delivery/teamwork.md` — se hizo**: dice qué viaja y que la memoria del runner arranca vacía.
- **Causa, «con `../../externo` el destino cae en el original» — es correcto y no se toca**: la línea usa
  ese mismo directorio, que es lo que tiene que pasar con una raíz que está fuera de la carpeta de sesión.
- **Tradeoff «trae también lo que no es producto» — se paga.**
- **Tradeoff del archivo de sesión enlazado — vale a medias.** Lo que la instalación del runner escribe en
  la carpeta de la línea, como su `CLAUDE.md`, queda propio; el resto de los archivos sueltos se enlaza.
- **Tradeoff «declarar cada servicio como raíz propia» — no hace falta.**
- **Lo que el caso dice que no es de Cauce** —el nombre de las ramas de línea y las herramientas de la
  instancia— no se tocó.

### Lo que el caso no preveía

- **Con la carpeta enlazada, una tarea tampoco resolvía su repositorio**, y el defecto no era de la línea:
  en la carpeta **original** `ops worktree` contestaba «no encontré el repositorio de api». `reposFor`
  preguntaba por git en la raíz, y una carpeta de repositorios no es ninguno. Ahora pregunta desde donde
  vive el servicio. Es la tercera forma de declarar una raíz; el 254 había afirmado que esa andaba, sin
  correrla, y quedó corregido ahí.

### Qué se corrió

- **La reproducción, antes y después**, en el banco. Antes: la carpeta de la línea con una sola entrada.
  Después: `enlazados al original: ../api, ../evidence, ../web`, con `.claude` y `CLAUDE.md` propios, y
  la carpeta original sin cambios. `ops worktree planning alta` resuelve `api` desde el original y desde la
  línea; antes fallaba en los dos.
- **Cuatro mutaciones.** Dos en rojo a la primera —sin enlazar hijos, y el repositorio preguntado en la
  raíz—. **Dos sobrevivieron**: saltear la instancia, que era redundante y se quitó; y saltear la
  configuración del runner, que no se veía porque la instalación ya la había creado. Se agregó el caso del
  runner sin instalar y se vio en rojo.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: la instancia real que lo reportó, y una sesión abierta en la carpeta de la línea.

### Corridas enteras del 2026-10-05, en sesiones interactivas

Dos corridas reales de `autobuild` manejadas por una terminal virtual, en modo `auto`, con el motor de
este cambio: un banco sidecar con la raíz declarada como carpeta de repositorios y dos tareas del mismo
servicio, cortado a propósito en Build y retomado; y un banco con una instancia embebida.

El banco sidecar tenía esa forma: `workspaceRoots: ['..']`, con la instancia y el producto como
repositorios dentro de una carpeta que no lo es. La corrida entera resolvió el servicio, commiteó en su
repositorio y `check` terminó válido y sin avisos.

Y una tercera corrida, dentro de una línea: con ese mismo banco, `ops line . admin` dejó la carpeta de la
línea con `acme-ops` como worktree en `line/admin`, `app` enlazado y su propia configuración. El árbol
principal no ofrecía la tarea del hito `line: admin`; la línea sí. Una sesión abierta ahí corrió
`/autobuild` entero: commit del producto en `feat/baja-marca-inactivo`, y en la instancia dos commits en
`line/admin`, el cierre de la tarea y el checkpoint del hito. Dejó tres hallazgos, que salieron como casos:
273, 274 y 275.
