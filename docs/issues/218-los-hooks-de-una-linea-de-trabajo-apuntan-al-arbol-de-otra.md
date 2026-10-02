---
caso: 218
titulo: los hooks de una línea de trabajo apuntan al árbol de otra
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 218 — Con dos líneas en paralelo, un guard mergeado a `main` no rige en la sesión que todavía no lo trajo

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: un guard —una defensa— no rige donde se cree que rige, y nada lo avisa. Reproducido el
2026-10-01 en un banco; sube a alta para toda instancia que trabaje con más de una línea a la vez.

## Resumen

`automation install` escribe `.claude/` en la carpeta que contiene a la instancia, y sus hooks apuntan a una ruta
fija: `$CLAUDE_PROJECT_DIR/ops/automatization/hooks/…`. Con varias líneas de trabajo como worktrees del repo de la
instancia (`ops/` y `ops-b/`), esa carpeta es la misma para las dos, así que **todas las sesiones corren los guards
de un solo árbol**, el que esté en la rama que esté. Y el worktree no tiene `node_modules` —está gitignoreado—, así
que no se puede instalar ahí; si se lo resuelve enlazando o con `npm install`, la instalación **reescribe la
configuración compartida** y desde ese momento todas las sesiones corren los guards de esa línea.

## Reproducción

Banco `suelto` copiado fuera del árbol a `w218/ops`, con el runner instalado. Desde `ops`:
`git worktree add ../ops-b -b work/b`. Después, el guard de shell de cada árbol con `{"tool_name":"Bash",
"tool_input":{"command":"rm -rf /"}}` por stdin, y por último `node_modules` enlazado en `ops-b` y
`automation install . claude` desde ahí.

## Síntoma

```
== dónde quedó .claude: …/w218/.claude
== node_modules en el worktree: ls: no se puede acceder a '../ops-b/node_modules'
== guard del árbol principal con un comando destructivo:
exit=2  BLOQUEADO: 'rm -r' sobre /, home o el directorio padre es catastrófico.
== guard del worktree, mismo comando:
exit=2  BLOQUEADO [pre-shell]: no se encontró el motor de hooks de Cauce.
```

`.claude/settings.json` antes de instalar en el worktree:

```
"command": "$CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-shell.sh"
```

y después, para todas las sesiones:

```
"command": "$CLAUDE_PROJECT_DIR/ops-b/automatization/hooks/guard-shell.sh"
```

## Causa raíz

- `automatization/runners/claude/settings.json:7` y siguientes — el comando del hook es
  `$CLAUDE_PROJECT_DIR/{{OPS_DIR}}automatization/hooks/…`, con `{{OPS_DIR}}` resuelto al instalar.
- `automation install` escribe ese archivo en la raíz de la sesión, que es la carpeta padre de la instancia y es
  compartida por todos sus worktrees.
- `automatization/hooks/run-hook.sh` busca el motor en `node_modules` del árbol, que un worktree no tiene.

## Fix propuesto

Que cada línea de trabajo tenga su propia raíz de sesión, con su `.claude/` apuntando a su propio árbol y su propio
motor. Hay más de una forma; se decide antes de construir.

**Decidido con Manuel el 2026-10-01: un comando que arma la línea**, `ops line <ops-root> <nombre>`, y que
`automation install` se niegue a mover los guards de una carpeta compartida a otro árbol.

## Contexto de descubrimiento

`acme-ops`, Cauce 0.99.2, 2026-10-01, nombrado como problema vecino en el caso 212 y partido de él al mejorarlo.

## Relacionados

- 212 — la misma situación de líneas en paralelo.

## Cierre

Recorrido contra el caso entero:

- **Fix, cada línea con su raíz de sesión** → se hizo con `ops line` (`engine/cli/lines.js`): crea
  `<carpeta>-<nombre>/` con un worktree de la instancia en `line/<nombre>`, su motor enlazado al `node_modules`
  del árbol principal, los repositorios del producto que viven fuera de la instancia enlazados, y los mismos
  runners instalados ahí. Para una instancia embebida, la línea es un worktree hermano del repo entero.
- **Lo que el caso no preveía:** que instalar desde un worktree **reescribe** la configuración compartida —la
  última línea que instala manda sobre todas—. `automation install` ahora se niega cuando los guards de esa
  configuración apuntan a otro árbol que existe, y dice que para una línea está `ops line`; con `--force` se
  mueven, que es la salida declarada. Una ruta que no lleva a nada sigue migrándose, porque es cableado viejo
  (lo atrapó la prueba de migración existente).
- **Lo que no cambia, y por qué:** el motor de la línea es el mismo paquete instalado que el del árbol principal,
  porque su versión la fija la instalación y no la rama.

- **Lo que encontró la revisión del conjunto, antes del PR:** la configuración del usuario se leía con una regex
  sobre el texto, y un hook propio con comillas escapadas hacía fallar toda instalación; en Codex, que escribe la
  ruta absoluta del árbol, el freno no frenaba nada; una instancia pedida por un enlace dejaba la línea en la
  carpeta compartida; y una línea borrada a mano se daba por reusada y quedaba a medias. Los cuatro se
  arreglaron, cada uno con su prueba y su mutación vista en rojo.

**Probado corriendo.**
- **Real**, en un banco fuera del árbol: `ops line . b` dejó `l218-b/` con el worktree en `line/b`; su
  `.claude/settings.json` apunta a `$CLAUDE_PROJECT_DIR/ops/…`, que desde esa sesión es su árbol; la
  configuración principal quedó igual; el guard de la línea, corrido como lo hace Claude con `rm -rf /`, salió
  2 con «'rm -r' sobre /, home o el directorio padre es catastrófico»; correrlo de nuevo reusa la línea. Y sobre
  el banco donde la instalación desde `ops-b` había movido los guards, reinstalar desde `ops` ahora se niega.
- Arnés: `test/wiring/lines.test.js`, cinco casos con git real. Mutaciones vistas en rojo: el freno apagado,
  `--force` que no pasa, línea sin motor, línea sin runners, embebida tratada como sidecar y el producto sin
  enlazar.
