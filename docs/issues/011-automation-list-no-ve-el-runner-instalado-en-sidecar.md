---
caso: 011
titulo: automation list nunca marca un runner como instalado en modo sidecar
estado: resuelto
prioridad: media
version-detectada: 0.58.0
resuelto-en: 0.59.0
---

# 011 — `automation list` no ve el runner instalado en modo `sidecar`

**🟢 resuelto en 0.59.0** · detectado en 0.58.0 · prioridad **media** — el comando que informa la instalación informa lo contrario

## Resumen

`automation list` busca el wiring **dentro de la instancia**. En modo `sidecar` el wiring va al padre,
que es donde el dev abre su herramienta, así que la búsqueda falla siempre y los cuatro runners salen
marcados `○` — sin instalar— aunque estén instalados y operativos.

En `embedded` funciona, porque ahí la instancia y el destino del wiring son el mismo directorio.

`sidecar` es el modo por defecto y el que el README recomienda para varios repos de producto.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install --runner claude
cd ops
node tools/ops.js automation list .      # ○ claude   ← dice que no está
node tools/ops.js automation doctor . claude   # ✓ adaptador operativo

# el mismo comando en embedded, para contrastar
cd ../.. && mkdir mi-repo && cd mi-repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init . --mode embedded --install --runner claude
node tools/ops.js automation list .      # ● claude [instalado]
```

## Síntoma

```text
── SIDECAR ──
○ claude · nativeHooks, nativeWorkflows, projectInstructions, nativeSkills
  .claude/settings.json dentro de ops/: no
  .claude/settings.json en el padre:    sí
✓ claude: adaptador operativo (0 advertencia(s))

── EMBEDDED ──
● claude [instalado] · nativeHooks, nativeWorkflows, projectInstructions, nativeSkills
```

En una instancia real —`venotal-ops`, con Claude y Gemini instalados hace días y los dos reportados
operativos por `doctor`— los cuatro adaptadores salen `○`. El glifo deja de informar: no distingue
ningún caso del otro.

## Causa raíz

`engine/cli/wiring.js:217`:

```js
const installed = fs.existsSync(path.join(root, runner.config.target))
```

`root` es la raíz de la instancia y `runner.config.target` es la ruta relativa del manifiesto
(`.claude/settings.json`). En `sidecar` el destino real es `<padre>/.claude/settings.json`.

El motor ya sabe resolverlo: `runnerPaths(root, name, runner)` es lo que usan `install`, `doctor` y
`uninstall` —comprobado, los tres aciertan el padre—. `list` es el único que compone la ruta a mano.

## Fix propuesto

Usar la misma resolución que el resto del módulo:

```diff
-const installed = fs.existsSync(path.join(root, runner.config.target))
+// La misma resolución que install, doctor y uninstall: en `sidecar` el wiring vive en el padre, que
+// es donde el dev abre su herramienta. Componer la ruta contra la instancia sólo acierta en
+// `embedded`, y dejaba a los cuatro adaptadores marcados como no instalados en el modo por defecto.
+const installed = fs.existsSync(runnerPaths(root, name, runner).configTarget)
```

## Tradeoffs

Ninguno: es la resolución que ya usan los otros tres comandos del mismo módulo. El único efecto
observable es que `list` empieza a marcar `●` donde corresponde.

Vale mirar de paso si algún otro punto del módulo compone esa ruta a mano; éste apareció por
contraste con `doctor`, no por búsqueda.

## Contexto de descubrimiento

Barriendo el ciclo de vida completo de Cauce 0.58.0 el 2026-09-03 —lectura, catálogo, instalación,
desinstalación, integración, fork de cargo, archivado y borrado— para responder si quedaba algo por
reportar después de que 0.55.0–0.58.0 cerraran diez casos. Todo lo demás pasó limpio; éste fue el único
hallazgo del barrido.

Se notó por contraste dentro de la misma corrida: `list` decía `○ claude` y `doctor`, dos líneas más
abajo, `✓ adaptador operativo`.

## Resolución

**Resuelto en 0.59.0** con el fix propuesto, más un paso que faltaba: `runnerPaths` se exportaba desde
`engine/automation/runners.js` pero no desde el índice del módulo, que es lo que `wiring.js` importa.
El diff no compilaba hasta agregarlo ahí.

Se comprobó lo que el caso pedía mirar de paso: `wiring.js:217` era el único punto que componía la ruta
a mano para **decidir** algo. Los otros siete usos de `runner.config.target` en `index.js` son texto de
mensajes.

Verificado el 2026-09-03: en `sidecar`, `automation list` marca `● claude [instalado]` y deja `○ codex`
—el glifo vuelve a distinguir—.

## Relacionados

Ninguno.
