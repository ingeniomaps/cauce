---
caso: 005
titulo: cauce init y cauce init . producen modos distintos en el mismo directorio
estado: resuelto
prioridad: media
version-detectada: 0.54.0
resuelto-en: 0.55.0
---

# 005 — Escribir el punto cambia el modo en silencio

**🟢 resuelto en 0.55.0** · detectado en 0.54.0 · prioridad **media** — ergonomía con consecuencia estructural

## Resumen

En el mismo directorio, `cauce init` y `cauce init .` crean instancias distintas: la primera en modo
`sidecar`, la segunda en `embedded`. El default del modo sale de **si se escribió un argumento**, no de
a dónde apunta ese argumento. Como `implicitTarget` ya resuelve `.` para un directorio terminado en
`-ops`, escribir el punto explícitamente —la forma más natural de decir «acá»— cambia la instancia.

## Reproducción

```bash
mkdir acme-ops && cd acme-ops
npx @ingeniomaps/cauce@0.54.0 init --no-install
node -p "require('./ops.config.json').mode"                    # sidecar
node -p "require('./ops.config.json').workspaceRoots[0].path"  # ..

cd .. && rm -rf acme-ops && mkdir acme-ops && cd acme-ops
npx @ingeniomaps/cauce@0.54.0 init . --no-install
node -p "require('./ops.config.json').mode"                    # embedded
node -p "require('./ops.config.json').workspaceRoots[0].path"  # .
```

## Síntoma

```text
acme-ops/$ cauce init      → mode: sidecar    workspaceRoots[0].path: ".."
acme-ops/$ cauce init .    → mode: embedded   workspaceRoots[0].path: "."
```

No es cosmético. En `embedded` la raíz del workspace pasa a ser la carpeta ops misma, así que
`guard-workspace-boundary` deja de reconocer los repos hermanos y `automation install` escribe el
wiring del runner **adentro** de `acme-ops/` en vez de al lado, donde el dev abre su herramienta.

## Causa raíz

`engine/cli/ops.js:76`:

```js
const root = path.resolve(target || implicitTarget(process.cwd()))
const mode = cli.value('--mode', target ? 'embedded' : 'sidecar')
```

`implicitTarget` (`ops.js:24`) ya tiene la heurística correcta y la aplica sólo al destino: un
directorio llamado `ops` o terminado en `-ops` **es** la instancia. El modo, en cambio, se decide por
la presencia del argumento. Las dos invocaciones resuelven el mismo `root` y eligen modos opuestos.

El README documenta `init . --mode embedded --force` para el caso embebido, así que la forma correcta
existe y es explícita. El problema es que la forma implícita también decide, y decide distinto.

## Fix propuesto

Derivar el default del path resuelto, con la misma heurística que ya existe para el destino:

```diff
 const root = path.resolve(target || implicitTarget(process.cwd()))
-const mode = cli.value('--mode', target ? 'embedded' : 'sidecar')
+// El modo lo decide a dónde apunta el destino, no si alguien escribió el argumento: `init` e `init .`
+// resuelven el mismo directorio, y una carpeta que ya se llama como el toolkit es la instancia.
+const base = path.basename(root)
+const implicitMode = base === DEFAULT_TARGET || base.endsWith('-ops') ? 'sidecar' : 'embedded'
+const mode = cli.value('--mode', implicitMode)
 if (!['embedded', 'sidecar'].includes(mode)) fail('--mode debe ser embedded o sidecar.', 2)
```

Con esto `init`, `init .` e `init acme-ops` desde el padre coinciden, y el caso embebido sigue
disponible donde el README lo documenta: pedido explícito con `--mode embedded`.

## Tradeoffs

Cambia el default de `init .` en un directorio llamado `ops` o `*-ops`, que hoy da `embedded`. Es un
cambio de comportamiento observable y va en el CHANGELOG. En cualquier otro nombre de directorio el
default sigue siendo `embedded`, igual que hoy.

Queda una asimetría deliberada: `init ops` desde el padre da `sidecar` por el nombre del destino, y
`init apps/web` da `embedded`. Es la misma regla, aplicada al mismo dato.

## Contexto de descubrimiento

Preparando la migración de `venotal-ops` a Cauce 0.54.0 el 2026-09-02. El primer ensayo se corrió con
`init . --force` y produjo una instancia `embedded` con `workspaceRoots: ["."]`, que para un repo
sidecar que coordina tres repos hermanos es el modo equivocado. Hubo que descartar el ensayo y
repetirlo sin el punto.

## Resolución

**Resuelto en 0.55.0.** El modo lo decide el destino resuelto, con la misma heurística que ya elegía
dónde aterrizar. Es el fix propuesto acá.

Verificado el 2026-09-03: en `acme-ops/`, `init` e `init .` dan los dos `sidecar` con raíz `..`;
`init . --mode embedded` sigue dando `embedded`; y en una carpeta que no termina en `-ops`, `init .`
sigue dando `embedded`.

## Relacionados

Ninguno.
