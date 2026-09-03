---
caso: 004
titulo: upgrade --check no reporta ediciones locales cuando la versión coincide
estado: resuelto
prioridad: media
version-detectada: 0.54.0
resuelto-en: 0.55.0
---

# 004 — `upgrade --check` es ciego justo cuando más se lo consulta

**🟢 resuelto en 0.55.0** · detectado en 0.54.0 · prioridad **media** — el modo seguro no puede avisar

## Resumen

`--check` existe para mirar antes de aplicar. Cuando la versión de la instancia coincide con la del
motor instalado, sale por un camino corto que informa «estás al día» y **nunca llega** a listar los
archivos del sistema editados localmente. El comando que no toca nada es el único que no puede decirte
qué está en conflicto; hay que correr el que sí toca para enterarse.

Es el estado normal entre actualizaciones: `init` fija la versión exacta, así que instancia y motor
coinciden todo el tiempo salvo el rato que va de un `npm install` al `upgrade`.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.54.0 init ops --mode sidecar --install
cd ops
echo "mi edición local" >> planning/PROTOCOL.md

node tools/ops.js upgrade . --check     # no dice nada del archivo editado
node tools/ops.js upgrade .             # ahora sí
```

## Síntoma

```text
$ node tools/ops.js upgrade . --check
= 0.54.0: la instancia está al día con el motor instalado
  para traer una versión más nueva: npm install --save-dev @ingeniomaps/cauce@latest

$ node tools/ops.js upgrade .
✗ planning/PROTOCOL.md

1 archivo(s) que mantiene Cauce fueron editados y se perderían.
```

## Causa raíz

`engine/cli/instance.js:307-325`. Dentro de `if (dry)`, la rama `from === to` imprime y retorna:

```js
if (dry) {
  if (from === to) {
    console.log(`= ${to}: la instancia está al día con el motor instalado`)
    return console.log('  para traer una versión más nueva: npm install …')
  }
  ...
  for (const file of changed) console.log(`  editado localmente: ${file}`)
  process.exit(1)
}
```

`changed` se calcula antes (`const changed = O.localChanges(root)`) y queda sin usar en ese camino.

Son dos preguntas distintas metidas en la misma rama: «¿hay una versión más nueva?» y «¿qué tengo
editado que se perdería?». La segunda tiene respuesta útil aunque la primera sea que no.

## Fix propuesto

Reportar `changed` antes de decidir por la comparación de versiones:

```diff
 if (dry) {
+  // Lo editado localmente se informa siempre: es la pregunta que `--check` viene a contestar, y no
+  // depende de que haya una versión más nueva. Sin esto, el único modo que no toca nada era también
+  // el único que no podía avisar del conflicto.
+  for (const file of changed) console.log(`  editado localmente: ${file}`)
   if (from === to) {
     console.log(`= ${to}: la instancia está al día con el motor instalado`)
-    return console.log('  para traer una versión más nueva: npm install --save-dev @ingeniomaps/cauce@latest')
+    console.log('  para traer una versión más nueva: npm install --save-dev @ingeniomaps/cauce@latest')
+    return changed.length ? process.exit(1) : undefined
   }
   ...
-  for (const file of changed) console.log(`  editado localmente: ${file}`)
   process.exit(1)
 }
```

## Tradeoffs

`upgrade --check` pasa a salir 1 en un caso donde hoy sale 0: instancia al día **con** archivos del
sistema editados. Es el resultado correcto —hay algo que resolver antes de la próxima actualización— y
puede romper un script que hoy trate ese 0 como «no hay nada que hacer». Va en el CHANGELOG.

## Contexto de descubrimiento

Migrando `venotal-ops` a Cauce 0.54.0 el 2026-09-02, verificando qué iba a pasar en la próxima
actualización con un `AGENTS.md` lleno de contenido del proyecto. `--check` dijo que todo estaba al
día; el `upgrade` de verdad se detuvo nombrando el archivo.

## Relacionados

- [001](001-upgrade-pisa-lo-que-init-force-conservo.md) — el mismo `upgrade`, ahí sin la protección
  puesta; acá con la protección puesta pero incapaz de anticiparla.
