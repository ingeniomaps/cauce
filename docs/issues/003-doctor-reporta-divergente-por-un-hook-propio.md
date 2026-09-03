---
caso: 003
titulo: doctor reporta la configuración como divergente por agregar un hook propio
estado: resuelto
prioridad: media
version-detectada: 0.54.0
resuelto-en: 0.55.0
---

# 003 — `doctor` llama divergente a una configuración completa

**🟢 resuelto en 0.55.0** · detectado en 0.54.0 · prioridad **media** — diagnóstico falso, no rompe nada

## Resumen

El README promete que la instalación *«fusiona la configuración propia del runner y conserva las
entradas existentes»*. Lo hace. Pero si una de esas entradas propias vive dentro de uno de los grupos
que escribe el toolkit, `automation doctor` reporta la configuración como incompleta o divergente,
aunque todas las entradas esperadas estén.

Hay un workaround —un segundo grupo con el mismo `matcher`— que funciona y es indescubrible: el mensaje
de error no lo insinúa.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.54.0 init ops --mode sidecar --install --runner claude

# agregar un hook propio DENTRO del grupo Bash que escribió el toolkit,
# sin quitar ninguna de sus entradas
python3 - <<'PY'
import json
d = json.load(open('.claude/settings.json'))
for g in d['hooks']['PreToolUse']:
    if g.get('matcher') == 'Bash':
        g['hooks'].append({"type": "command", "command": "$CLAUDE_PROJECT_DIR/ops/mio.sh"})
json.dump(d, open('.claude/settings.json', 'w'), indent=2)
PY

cd ops && node tools/ops.js automation doctor . claude
```

## Síntoma

```text
✗ claude: .claude/settings.json: configuración instalada incompleta o divergente
claude: 1 error(es), 0 advertencia(s)
```

Ni incompleta ni divergente: `guard-shell.sh`, `guard-files.sh` y `guard-planning-drift.sh` están los
tres, con su matcher correcto. Lo único que cambió es que hay un hook más.

## Causa raíz

`engine/automation/config.js:84`:

```js
function includesConfig(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => {
      return actual.some((value) => JSON.stringify(value) === JSON.stringify(item))
    })
  }
  ...
```

La comprobación es «contiene», que es lo correcto, pero la unidad de comparación es el **ítem entero**
serializado. Un grupo `{matcher, hooks}` con un hook extra ya no es el mismo objeto, así que no se
encuentra ninguno igual y el grupo entero cuenta como ausente. El anidamiento —donde vive la diferencia
real— nunca se mira.

## Fix propuesto

Comparar estructuralmente los grupos de hooks: mismo `matcher`, y que sus `hooks` contengan los
esperados.

```diff
 function includesConfig(actual, expected) {
   if (Array.isArray(expected)) {
-    return Array.isArray(actual) && expected.every((item) => {
-      return actual.some((value) => JSON.stringify(value) === JSON.stringify(item))
-    })
+    return Array.isArray(actual) && expected.every((item) => actual.some((value) => {
+      // Un grupo de hooks se compara por su contenido, no por su forma serializada: la instalación
+      // promete conservar lo que el proyecto ya tenía, y un hook propio sumado al grupo no vuelve
+      // divergente a una configuración que tiene todo lo que esperamos.
+      if (item && typeof item === 'object' && Array.isArray(item.hooks)) {
+        return value && typeof value === 'object'
+          && value.matcher === item.matcher
+          && includesConfig(value.hooks, item.hooks)
+      }
+      return JSON.stringify(value) === JSON.stringify(item)
+    }))
   }
```

## Tradeoffs

`doctor` se vuelve más tolerante y deja de detectar un caso: que alguien haya reordenado o reescrito un
grupo del toolkit conservando sus hooks. Es exactamente lo que la instalación permite hacer, así que
detectarlo era un falso positivo, no una protección.

Lo que sí se sigue detectando es lo que importa: que falte una entrada esperada.

## Contexto de descubrimiento

Migrando `venotal-ops` a Cauce 0.54.0 el 2026-09-02, al registrar el guard propio del proyecto. La
primera forma de hacerlo —sumarlo al grupo `Bash` existente— dejó a `doctor` en rojo sin explicar por
qué. La segunda —un grupo nuevo con el mismo matcher— pasó. Las dos configuraciones son equivalentes
para el runner.

## Resolución

**Resuelto en 0.55.0.** `includesConfig` compara los grupos de hooks por `matcher` y contenido en vez
de por el objeto serializado. Es el fix propuesto acá.

Verificado el 2026-09-03: con un hook propio dentro del grupo `Bash`, `doctor` reporta
`✓ adaptador operativo`. Y no regresionó: borrando el grupo `Edit|Write` que registra `guard-files.sh`,
vuelve a reportar la configuración como incompleta.

## Relacionados

- [002](002-automation-install-desregistra-guards-propios.md) — el mismo hook propio, visto desde la
  instalación en vez de desde el diagnóstico.
