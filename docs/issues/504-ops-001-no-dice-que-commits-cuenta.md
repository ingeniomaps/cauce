---
caso: 504
titulo: El aviso OPS-001 cuenta commits sin registrar y no dice cuáles, ni con `--json`
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 504 — El aviso OPS-001 cuenta commits sin registrar y no dice cuáles, ni con `--json`

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**: es un aviso y no frena nada. Pero la única salida que deja es buscar a mano en `git log` lo que el motor ya calculó. Sube a media si se mide que alguien escribió una entrada de DONE de memoria para callarlo.

## Resumen

`ops check` avisa «N commit(s) desde <fecha> que ninguna entrada de DONE nombra (OPS-001)» y no nombra ninguno. `unrecordedCommits` ya devuelve cada uno con hash, fecha y asunto, y `coverageWarnings` se queda sólo con el largo de la lista. Con `--json` sale el mismo texto.

Además la ventana se compara por día: arranca en la fecha de la entrada de DONE más reciente, sin hora. El día en que se instala Cauce cuenta como sin registrar el commit del proyecto anterior a Cauce, si es del mismo día. En la corrida a ciegas era ése: `d05d25f chore: initial`.

## Reproducción

Sobre una copia de la instancia que dejó la corrida a ciegas del caso 494 (`/var/tmp/repro-494-12`), con el motor de esta rama:

```bash
cd /var/tmp/repro-494-12/proyecto/ops
node <cauce>/engine/cli/ops.js check planning
node <cauce>/engine/cli/ops.js check planning --json
git -C .. log --format='%h %ad %s' --date=iso
```

## Síntoma

```
⚠ proyecto: 1 commit(s) desde 2026-11-05 que ninguna entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001)
```

En `--json`, `warnings` trae la misma cadena y nada más. El historial:

```
53584e8 2026-11-05 15:10:14 -0500 feat(text): add slugify      ← la entrada de DONE lo nombra
d05d25f 2026-11-05 15:05:04 -0500 chore: initial               ← anterior a Cauce, y es el que cuenta
```

También se reprodujo en el banco `suelto` el 2026-11-13: «11 commit(s)… (OPS-001)», sin ningún hash. Ese banco declara `workspaceRoots: ..`, así que contó los commits del repositorio de Cauce. Es una rareza del banco, no del aviso.

## Causa raíz

- `engine/core/repos.js:140-161`, `unrecordedCommits`: devuelve las líneas `%h %ad %s` de cada commit sin registrar.
- `engine/core/repos.js:186-187`, `coverageWarnings`: usa sólo `unrecorded.length`.
- `engine/core/repos.js:149` pide `--date=short` y `:158` filtra con `one.date >= since`, con `since` sin hora.

## Fix propuesto

1. El aviso nombra hasta cinco commits (`hash asunto`) y, si hay más, dice cuántos faltan. Con `--json`, además del texto, una lista con los hashes.
2. Prueba: con dos commits sin registrar, el aviso nombra los dos hashes. Mutación: volver a `length` pone roja la prueba.
3. La ventana por día **no se cambia acá**. Nombrar los commits ya deja ver el de antes de Cauce, y quien lee puede descartarlo. Afinarla pide la hora del commit de la entrada, y no todas las entradas tienen uno.

## Tradeoffs

- **El aviso se alarga.** Con cinco como tope son cinco líneas, y el que cuenta 54 sigue diciendo el número.
- Quien parsee el texto del aviso con una regex ve una cadena distinta. El cambio va en la versión abierta del CHANGELOG.

## Contexto de descubrimiento

Paso 11 del informe de la corrida a ciegas del caso 494 (2026-11-05): la sesión no supo qué commit era y tuvo que deducirlo. Contrastado el 2026-11-13. Lo de la ventana por día salió al reproducirlo.

## Relacionados

- 494, de donde sale.
- 082 y 169: el origen del aviso y su lectura del hash.
