---
caso: 366
titulo: un parche que renombra un archivo lo saca de las raíces sin que lo vea ningún guard
estado: resuelto
resuelto-en: 0.106.1
prioridad: media
version-detectada: 0.106.0
---

# 366 — Un `apply_patch` que renombra un archivo con `*** Move to:` pasa los guards de archivos por el destino: se muda afuera de las raíces, o a un nombre que otro guard cuida, y ninguno lo mira

**🟢 resuelto en 0.106.1** · detectado en 0.106.0 · prioridad **media**.

**Prioridad media**: es un hueco de varias defensas a la vez y no rompe nada que hoy ande. Lo usa Codex,
que escribe con `apply_patch`; los otros runners no renombran por esa vía.

## Resumen

Los guards de archivos sacan de un parche las rutas que toca: las líneas `*** Add File:`, `*** Update
File:` y `*** Delete File:`. El formato tiene una más. Después de un `*** Update File: a` puede venir
`*** Move to: b`, que renombra el archivo. Esa ruta no se leía, así que el destino de la mudanza no pasaba
por ningún guard: ni el de límites, ni el de credenciales, ni el de lo generado.

## Reproducción

```
*** Begin Patch
*** Update File: service/src/a.js
*** Move to: <una ruta fuera de las raíces>/b.js
@@
-x
+y
*** End Patch
```

## Síntoma

Preguntándole a `workspace-boundary` con el pedido de Codex, en una instancia con una raíz `service`:

```
pasa    Delete File adentro
FRENA   Delete File afuera
FRENA   Add File afuera
FRENA   Update File afuera
pasa    Update adentro + Move to afuera      ← el archivo sale de las raíces
pasa    Update adentro + Move to adentro
```

## Causa raíz

- `engine/hooks/input.js`, `filesOf` — el patrón `^\*\*\* (?:Add|Update|Delete) File:` no incluye `Move to:`.
- El motor ya sabía que esa línea existe: `engine/core/migrations.js`, `patchSections`, la nombra como parte
  del formato para no cortar una sección ahí (caso 199). Faltaba leerla como ruta.

## Fix propuesto

Que `filesOf` devuelva también la ruta de `*** Move to:`. Es una escritura más, en otra ruta, y todo guard
que lee `filesOf` la juzga sin tocarlo.

## Valor

Cierra de una vez el mismo hueco en todos los guards de archivos.

## Qué podría salir mal

1. **Frenar un renombrado legítimo.** Sólo si el destino es algo que ya se frenaba al escribirlo: es el
   mismo juicio sobre una ruta más.
2. **Que otro runner use esa línea con otro sentido.** No hay otro que mande el sobre de `apply_patch`.

## Cierre

**Resuelto en 0.106.1** con el fix propuesto.

### El recorrido de lo que este caso enumeró

- **Fix, leer el destino del renombrado — se hizo.**
- **Qué podría salir mal 1, un renombrado legítimo — no cambia**: mudar dentro de las raíces sigue pasando, y
  está probado en las tres formas en que llega el sobre.
- **2, otro sentido en otro runner — no aplica.** La línea se lee sólo dentro de un parche, que sólo manda
  Codex.

### Qué se corrió

- **El formato, en el binario**: `codex-cli 0.152.1` trae en su gramática `change_move: "*** Move to: "
  filename LF`. Verificado con `strings` sobre el ejecutable instalado.
- **El guard, sobre el parche del síntoma**, después del cambio: `Update adentro + Move to afuera` frena con
  «… está fuera de las raíces declaradas», y `Move to` adentro sigue pasando.
- Rojo previo: las dos pruebas de `test/hooks/patch-move.test.js`, antes del cambio. La segunda fija que el
  destino lo miran también los guards que cuidan un nombre: mudar un archivo a `.env` frena por
  `secrets`.
- Una mutación en rojo, en una copia fuera del árbol: sin `Move to` en el patrón, las dos pruebas fallan.
- No se pudo con una sesión real de Codex: la cuenta de esta máquina agotó su cupo hasta el 2026-11-04. Lo
  que se midió es el guard con el sobre que Codex manda.

### Lo que encontró la revisión independiente (2026-10-10)

Un hallazgo. **El guard de migraciones juzgaba el nombre nuevo contra el sobre entero.** Ese guard parte el
parche por archivo para mirar sólo lo que cada uno agrega (caso 199), y el destino de un renombrado no era
ninguna de sus secciones: un parche que renombraba una migración y le **quitaba** un `DROP TABLE` se
frenaba por ese mismo `DROP TABLE`. El nombre nuevo es ahora la misma sección que el viejo. Rojo previo, y
una mutación: sin eso, la prueba falla. Lo demás lo confirmó: el destino fuera de las raíces frena, y uno
con nombre de archivo generado frena por su guard.

## Contexto de descubrimiento

Al cerrar el 365 quedó la pregunta de si borrar por la herramienta de archivos tenía el mismo hueco que
borrar por shell. No lo tiene —`*** Delete File:` ya se juzgaba—, y probando el formato entero apareció
éste.

## Relacionados

- [365](./365-el-guard-de-shell-no-ve-un-borrado-fuera-de-las-raices.md) — de donde sale.
- [199](./199-un-apply-patch-de-codex-no-parte-la-migracion-por-sus-marcadores.md) — donde el motor aprendió
  que `*** Move to:` es parte del formato.
