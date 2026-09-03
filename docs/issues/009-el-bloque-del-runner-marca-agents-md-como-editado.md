---
caso: 009
titulo: el bloque que automation install escribe en AGENTS.md lo deja marcado como edición local
estado: resuelto
prioridad: alta
version-detectada: 0.56.0
resuelto-en: 0.57.0
---

# 009 — El bloque del runner marca `AGENTS.md` como editado por la empresa

**🟢 resuelto en 0.57.0** · detectado en 0.56.0 · prioridad **alta** — bloquea el upgrade sin que nadie haya editado nada

## Resumen

En modo `embedded`, `automation install <runner>` escribe sus instrucciones dentro de `AGENTS.md`, entre
marcas. Es deliberado y funciona. Pero `AGENTS.md` está en `SYSTEM_FILES`, y el registro que decide qué
editó la empresa no se entera: queda con el digest anterior al bloque.

Resultado: el `upgrade` siguiente se detiene diciendo que el proyecto editó `AGENTS.md`, cuando quien lo
escribió fue Cauce en el comando de al lado. El consejo que imprime es además el opuesto al caso —«esos
docs son del toolkit y no llevan una línea de la empresa»— sobre el único archivo del sistema que sí
lleva un bloque puesto por nosotros.

Afecta a todo runner cuyo destino de instrucciones sea `AGENTS.md` —hoy Codex— en instancias `embedded`.
En `sidecar` el archivo del runner vive en el repo de la compañía y no es el de la instancia, así que no
se cruza.

## Reproducción

```bash
mkdir acme && cd acme && git init -q .
npx @ingeniomaps/cauce@0.56.0 init . --mode embedded
node tools/ops.js automation install . codex     # escribe el bloque en AGENTS.md

node tools/ops.js upgrade . --check              # dice que lo editaste
node tools/ops.js upgrade .                      # y se detiene
```

## Síntoma

```text
$ node tools/ops.js automation install . codex
✓ codex: sus instrucciones quedaron dentro de AGENTS.md

$ node tools/ops.js upgrade . --check
  editado localmente: AGENTS.md

$ node tools/ops.js upgrade .
✗ AGENTS.md

1 archivo(s) que mantiene Cauce fueron editados y se perderían.

Esos docs son del toolkit y no llevan una línea de la empresa: se reemplazan enteros en
cada actualización para que las mejoras lleguen.
```

Nadie tocó el archivo. El bloque lo puso el comando que el README manda correr después de cada
`upgrade`.

## Causa raíz

`AGENTS.md` vive en las dos secciones del manifiesto y sólo se actualiza una.

`engine/automation/index.js:417` anota lo que acaba de escribir en la sección `runners`:

```js
deliveredPaths[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
```

Eso produce la clave `codex/AGENTS.md`. Pero `O.localChanges` (`engine/core/ownership.js:244`) compara
contra la sección `files`, con la clave `AGENTS.md`, que quedó como la escribió `scaffold`. Los dos
digests conviven y no coinciden:

```text
files[AGENTS.md]         = 03053adc8df5317a   ← antes del bloque
runners[codex/AGENTS.md] = 147ad540ba934690   ← después del bloque
digest en disco          = 147ad540ba934690
```

Las dos secciones son dos entregas distintas por diseño —lo dice `manifest.js:27`— y esa separación es
correcta. Lo que falta es que un archivo que es de las dos se anote en las dos.

## Fix propuesto

Que `install` actualice también el registro de archivos cuando el destino es un archivo del sistema:

```diff
 if (ownFile && isSharedFile(root, resolved.target)) {
   ...
   deliveredPaths[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
+  // El bloque lo escribimos nosotros, así que el registro de archivos tiene que decir que esto es lo
+  // entregado: si no, `localChanges` lee el digest previo al bloque y `upgrade` acusa a la empresa de
+  // una edición que hizo el comando de al lado.
+  M.write(root, M.recordPaths(root, [relativeSystemPath], M.read(root)))
   continue
 }
```

Queda por decidir un detalle que el fix de arriba no resuelve: qué hace `upgrade` cuando reemplace ese
`AGENTS.md`. Reemplazarlo entero se lleva el bloque del runner, y la instancia queda sin las
instrucciones hasta el `automation install` siguiente —que el README ya manda correr, y que `upgrade`
recuerda al terminar—. Es aceptable y conviene decirlo en la salida.

## Tradeoffs

Ninguno funcional. El riesgo es el opuesto: si el registro de archivos se actualiza con el bloque
adentro, una edición **de verdad** de la empresa sobre el resto de `AGENTS.md` se sigue detectando,
porque cambia el digest igual. Lo que deja de detectarse es exactamente lo que nosotros escribimos.

## Contexto de descubrimiento

Evaluando los dos caminos del caso [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) el
2026-09-03. Uno de ellos proponía reusar el bloque delimitado de `mergeInstruction` para el contenido
del proyecto dentro de `AGENTS.md`, por ser un mecanismo ya probado. Al comprobarlo apareció que ese
mecanismo ya está en uso sobre ese mismo archivo, y que ya choca con la propiedad por archivo.

Es la razón por la que 008 se resolvió por el otro camino.

## Resolución

**Resuelto en 0.57.0.** `install` anota el bloque en las dos secciones del manifiesto cuando el destino
es un archivo del sistema, que era lo que faltaba: la de runners ya se actualizaba y la de archivos
—la que lee `localChanges`— quedaba con el digest previo.

Lo que se comprobó, y era el riesgo del fix: una edición **de verdad** de la empresa sobre el resto de
`AGENTS.md` se sigue detectando, porque cambia el digest igual. Lo que deja de contarse es sólo lo que
escribimos nosotros.

Verificado el 2026-09-03 con el repro de arriba: tras `automation install . codex`, `upgrade --check`
sale 0 y no nombra `AGENTS.md`; agregándole una sección propia, vuelve a nombrarlo.

Queda **sin hacer** lo que el «Fix propuesto» dejaba por decidir: `upgrade` sigue reemplazando
`AGENTS.md` entero, así que se lleva el bloque del runner hasta el `automation install` siguiente —que
el README ya manda correr y que `upgrade` recuerda al terminar—. Es aceptable y no está dicho en la
salida; si molesta, es un caso nuevo.

## Relacionados

- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — el bloque delimitado como alternativa
  descartada; este caso es por qué se descartó.
- [001](001-upgrade-pisa-lo-que-init-force-conservo.md) — la otra vez que el manifiesto registró como
  entregado algo que no describía lo entregado.
