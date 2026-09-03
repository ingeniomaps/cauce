---
caso: 008
titulo: el README manda completar AGENTS.md, que es del toolkit y upgrade reemplaza
estado: abierto
prioridad: media
version-detectada: 0.56.0
resuelto-en:
---

# 008 — El README manda completar un archivo que el toolkit reemplaza

**🔴 abierto** · detectado en 0.56.0 · prioridad **media** — fricción garantizada en cada versión

## Resumen

«Adaptación por proyecto», paso 2 del README: *«Completa `AGENTS.md`: límites de autonomía e
integraciones reales»*. Y el molde de `AGENTS.md` abre con una sección **Mapa real** que dice
«Completar antes de la primera tarea».

`AGENTS.md` está en `SYSTEM_FILES` (`engine/core/ownership.js:46`), así que lo mantiene el toolkit y
`upgrade` lo reemplaza entero. Desde 0.55.0 no lo pisa en silencio —se detiene y lo nombra, que es lo
correcto—, pero el contrato sigue pidiéndole al proyecto que escriba en el único archivo garantizado a
entrar en conflicto en cada actualización.

No es pérdida de datos. Es que el trabajo de fusión es inevitable y recurrente, por diseño.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.56.0 init ops --mode sidecar --install
cd ops

# hacer lo que dice el paso 2 del README
printf '\n## Mapa real\n\nTres servicios: api (Go), web (Next), etl (Python).\n' >> AGENTS.md

node tools/ops.js upgrade . --check
```

## Síntoma

```text
  editado localmente: AGENTS.md
```

Y en la próxima versión, `upgrade` se detiene ahí hasta que alguien resuelva la fusión a mano. Todas
las veces, para siempre, sobre el archivo que el README manda llenar.

## Causa raíz

Dos afirmaciones del propio contrato que no conviven:

- `README.md`, «Adaptación por proyecto» paso 2: completá `AGENTS.md`.
- `template/AGENTS.md`, sección «Mapa real»: completar antes de la primera tarea.
- `engine/core/ownership.js:46`: `AGENTS.md` es del toolkit y `upgrade` lo reemplaza entero.

El comentario que justifica su inclusión en `SYSTEM_FILES` tiene razón en lo suyo —*«el `AGENTS.md` de
una instancia seguía describiendo carpetas que `upgrade` había retirado»*—: la parte que explica cómo
funciona Cauce **debe** actualizarse. El problema es que en el mismo archivo vive la parte que sólo
puede escribir el proyecto.

## Fix propuesto

Separar las dos naturalezas, que es lo que el toolkit ya hace en todos los demás lugares donde este
mismo problema aparece —`rules/system/` junto a las propias, `delivery/project.md` junto a las seis
guías—:

1. **`AGENTS.md` queda entero del toolkit** y pierde las secciones que pide completar.
2. **Nace `organization/workspace.md`** —o `AGENTS.project.md`, el nombre es lo de menos— con el mapa
   real, las integraciones y ambientes, y las excepciones de autonomía. Es del proyecto y `upgrade` no
   lo toca.
3. `AGENTS.md` lo enlaza en el lugar donde hoy están esas secciones.

Alternativa más barata si lo anterior es mucho: **un bloque delimitado** dentro de `AGENTS.md`, como el
que ya usa `mergeInstruction` para el wiring de los runners (`engine/automation/config.js:155`). Ese
mecanismo ya existe, ya sabe conservar el texto de la empresa alrededor de un bloque, y `upgrade`
reemplazaría todo menos lo de adentro.

## Tradeoffs

Un archivo más que leer antes de trabajar, y una migración para las instancias que ya llenaron su
`AGENTS.md`: `upgrade` tendría que mover ese contenido en vez de pedir la fusión, o al menos decir a
dónde va.

La alternativa del bloque delimitado no agrega archivo y reusa un mecanismo probado, a cambio de un
`AGENTS.md` que es mitad de cada uno — que es exactamente lo que hoy pasa, pero declarado.

## Contexto de descubrimiento

Adoptando Cauce en `venotal-ops` (0.54.0, 2026-09-02) y actualizando después a 0.55.0 y 0.56.0. El
`AGENTS.md` de ese repo lleva el mapa de cuatro repos con sus gates, las integraciones productivas con
su regla de escritura, y las 53 credenciales con quién carga cada una — todo lo que el paso 2 del
README pide. En las tres actualizaciones hubo que respaldarlo, correr `upgrade --force` y restaurarlo.

Las tres veces el molde de `AGENTS.md` venía idéntico, así que la fusión no aportó nada: fue trabajo
puro de ceremonia.

## Relacionados

- [007](007-el-override-por-nombre-retira-reglas-en-silencio.md) — el mismo choque entre lo del toolkit
  y lo del proyecto, en `rules/`.
