---
caso: 223
titulo: install no preserva los hooks ni los workflows propios de una instancia
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 223 — Una instancia que agrega hooks o workflows propios tiene que protegerlos de su propio `install`

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: una defensa propia desaparece en silencio. La reproducción está pendiente: lo que sigue sale de los commits de acme-ops y hay que comprobarlo contra el `install` de `main`.

## Resumen

acme-ops agrega guards y workflows propios junto a los de Cauce. Dos commits dicen que el camino de instalación no los conoce: en `0ca7f7d`, reinstalar se llevó de la configuración activa el guard de ADF del PR #41; en `8f0705b`, sus workflows necesitan un marcador propio (`{{SERVERS_ROOT}}`) que reemplazan con `sed`, porque `{{OPS_ROOT}}` sólo se resuelve en los workflows de Cauce.

## Reproducción

Pendiente de correr al tomar el caso, en un banco instalado: agregar un hook propio a `.claude/settings.json` y un workflow propio en `automatization/workflows/`, correr `automation install` y ver qué queda de cada uno. El caso 218 ya cambió cómo `install` trata los hooks ajenos (`foreignHooks`), así que puede que una parte esté resuelta.

## Síntoma

En acme el guard de ADF dejó de correr sin que nada lo dijera.

## Causa raíz

A establecer contra `engine/automation/index.js`: qué hace `install` con entradas de `settings.json` que no son de Cauce y si renderiza workflows de la instancia.

## Fix propuesto

Un contrato para lo propio: una carpeta o un prefijo que `install` preserva y renderiza con los mismos marcadores. Se decide después de reproducir.

## Tradeoffs

- Renderizar lo propio con los marcadores de Cauce los vuelve parte de la API: hay que decir cuáles son estables.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 218 — `install` y los hooks ajenos.
- 229 — un guard propio de acme que se perdió así.

## Cierre

Resuelto en 0.100.0. La reproducción partió el caso en dos mitades con destinos distintos.

- **Reproducir antes de decidir** — se hizo, en un banco instalado con el motor de `main`:
  - Un hook propio agregado a `.claude/settings.json`, con su script, **sobrevivió** a `automation install`.
    Esa mitad ya la había cerrado el caso 218 (`foreignHooks`). Lo que acme vivió en `0ca7f7d` venía de su
    `make links`, que copiaba la configuración activa sobre la del repo, no de `install`.
  - Un workflow propio en `.claude/workflows/` también sobrevivió, pero con `{{OPS_ROOT}}` sin resolver,
    mientras los de Cauce sí lo tenían. Ésa era la mitad abierta.
- **Un contrato para lo propio** — se hizo, con una decisión de Manuel sobre el lugar: la fuente va en
  `workflows/` de la instancia. `automation install` la renderiza con el mismo `render()` de los de Cauce al
  mismo directorio (`engine/automation/own-workflows.js`). Se niega a instalar uno que se llame como uno de
  Cauce, y retira la copia generada cuando se borra la fuente. Las copias llevan una marca en la primera línea,
  así que no se toca un archivo de ese directorio que no se generó.
- **Por qué no `automatization/workflows/`** — es una ruta que Cauce retiró. `upgrade` la trata como un resto y con
  `--force` la borra, y `check` avisa que «sigue en disco con contenido tuyo». Reabrirla obligaba a decidir qué
  hacer con las copias viejas que las instancias antiguas todavía tienen ahí.
- **Tradeoff: renderizar lo propio vuelve API a los marcadores** — se acepta: son los tres que el README del
  molde nombra (`{{OPS_ROOT}}`, `{{OPS_DIR}}`, `{{INCLUDE:…}}`), los mismos que usan los workflows de Cauce.

Prueba real:

- **Con el motor de esta rama, en el mismo banco:**
  - `workflows/propio.js`, con `{{INCLUDE:shared/workflow-root.js}}` y `{{OPS_ROOT}}`, salió
    `✓ claude: workflow propio workflows/propio.js → .claude/workflows/propio.js`, con cero marcadores sin
    resolver y `const AQUI = '<raíz real del banco>'`.
  - `workflows/autobuild.js` salió `✗ … se llama como un workflow de Cauce y no se instaló`, y el `autobuild.js`
    de Cauce quedó sin la marca.
  - Al borrar la fuente, la instalación siguiente dijo `− claude: retirado propio.js` y el archivo ya no estaba.
  - Con una carpeta `workflows/` presente, `check` y `automation doctor . claude` siguen en verde.
- **Cuatro mutaciones en una copia, cada una en rojo por `test/wiring/own-workflows.test.js`:**
  - Sin render.
  - Pisar uno de Cauce.
  - Borrar lo ajeno.
  - No retirar.
