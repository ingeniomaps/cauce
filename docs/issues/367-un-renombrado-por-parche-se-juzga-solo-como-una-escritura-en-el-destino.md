---
caso: 367
titulo: un renombrado por parche se juzga sólo como una escritura en el destino
estado: abierto
prioridad: media
version-detectada: 0.106.0
---

# 367 — Un `apply_patch` que renombra con `*** Move to:` se juzga como una escritura en el destino y nada más: no se lee el contenido que el archivo ya traía, ni se cuenta que el nombre viejo desaparece

**🔴 abierto** · detectado en 0.106.0 · prioridad **media**.

**Prioridad media**: son dos huecos de guards que ya existen, alcanzables sólo con Codex, que es quien
renombra por parche. Ninguno es una regresión: los dos pasaban igual antes del 366.

## Resumen

El caso 366 hizo que el destino de un renombrado sea una ruta más que los guards de archivos miran. Con eso
se frena mudar un archivo afuera de las raíces o a un nombre como `.env`. Lo que quedó sin mirar es lo que
un renombrado tiene de distinto de un archivo nuevo: llega **con contenido** que el parche no trae, y deja
**sin su nombre** al archivo de origen.

1. **El contenido que ya estaba en disco no se juzga.** De un archivo modificado, el guard de migraciones
   mira lo que el parche agrega. En un renombrado, lo que pasa a ser la migración es el archivo entero.
2. **El nombre viejo desaparece y nadie lo cuenta.** Renombrar una prueba a un nombre que no es de prueba
   la saca de la suite igual que borrarla, y `test-evidence` sólo frena el borrado.

## Reproducción

Con una instancia cuya raíz es `service`, un `service/scratch/drop.sql` que contiene `DROP TABLE users;` y
una prueba `service/src/a.test.js` commiteada:

```
*** Begin Patch
*** Update File: service/scratch/drop.sql
*** Move to: service/db/migrations/003_drop.sql
@@
 DROP TABLE users;
+-- listo
*** End Patch
```

```
*** Begin Patch
*** Update File: service/src/a.test.js
*** Move to: service/attic/a.js.txt
@@
-x
+y
*** End Patch
```

## Síntoma

Preguntándole a cada guard con el pedido de Codex, el 2026-10-10:

```
FRENA   migrations      Add File de una migración con DROP
pasa    migrations      Move to: un archivo con DROP en disco pasa a ser migración
FRENA   test-evidence   Delete File de una prueba
pasa    test-evidence   Move to: la prueba pasa a llamarse a.js.txt
```

## Causa raíz

- `engine/hooks/migrations.js` — para una sección de parche juzga `judgedPatch`, que de una modificación
  toma lo agregado. Para el destino de un renombrado no lee el archivo de origen.
- `engine/hooks/files.js`, `test-evidence` — mira las secciones `*** Delete File:`. Un `*** Move to:` no es
  una, y el archivo de origen deja de existir con ese nombre.

## Fix propuesto

1. Que el guard de migraciones, para un destino renombrado que es una migración y cuyo origen no lo era,
   juzgue lo que va a quedar: el archivo de origen como está en disco, menos lo que el parche quita, más lo
   que agrega.
2. Que `test-evidence` trate el origen de un renombrado como un borrado cuando el nombre nuevo deja de ser
   una prueba del proyecto.
3. Mirar si a algún otro guard de archivos le pasa lo mismo: `generated`, `secrets`, `engine`, `ops-config`.

## Valor

Cierra lo que el 366 dejó dicho de más: su entrada afirma que el destino de un renombrado se juzga, y se
juzga su ruta, no su contenido.

## Qué podría salir mal

1. **Frenar un renombrado legítimo de una migración** que trae un `DROP` y cuyo parche lo quita. Por eso el
   fix resta lo quitado en vez de leer el archivo tal cual.
2. **Frenar la mudanza de una prueba a otra carpeta.** Sólo cuenta como borrado si el nombre nuevo ya no es
   una prueba; moverla y que siga siéndolo no pierde nada.
3. **Leer del disco un archivo que el mismo parche crea más arriba.** El orden dentro del sobre importa y
   hoy ningún guard lo sigue.

## Contexto de descubrimiento

La revisión del conjunto de la versión 0.106.1, mirando el arreglo del 366. Se reprodujo antes de escribirlo.

## Relacionados

- [366](./366-un-parche-que-renombra-un-archivo-lo-saca-de-las-raices-sin-que-lo-vea-ningun-guard.md) — de donde
  sale: hizo que el destino se mire como ruta.
- [199](./199-un-apply-patch-de-codex-no-parte-la-migracion-por-sus-marcadores.md) — por qué una migración
  de un parche se juzga por su sección.
- [365](./365-el-guard-de-shell-no-ve-un-borrado-fuera-de-las-raices.md) — el mismo par por shell: un `mv`
  desde afuera borra de afuera, y ahí se decidió no frenarlo.
