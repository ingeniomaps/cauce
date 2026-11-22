---
caso: 546
titulo: instalar Codex blanquea la edición del AGENTS.md de la empresa, y el upgrade siguiente lo reemplaza entero
estado: abierto
prioridad: alta
version-detectada: 0.124.0
---

# 546 — instalar Codex blanquea la edición del AGENTS.md de la empresa, y el upgrade siguiente lo reemplaza entero

**🔴 abierto** · detectado en 0.124.0 · prioridad **alta**: se pierde texto de la empresa sin aviso. El `upgrade` lo
reporta como un reemplazo más, y lo que se pierde es lo único del archivo que no se puede regenerar.

## Resumen

En una instancia embebida, `init --force` conserva el `AGENTS.md` que la empresa ya tenía, y el manifiesto lo marca como
editado. Desde ahí `upgrade` lo conserva. Pero `automation install <dir> codex` mete su bloque en ese archivo y vuelve a
anotar su digest **sin mirar si ya estaba editado**. Con eso la edición desaparece del manifiesto, y el `upgrade`
siguiente cree que el archivo es el del molde sin tocar y lo reemplaza entero.

## Reproducción

```bash
# Banco desechable: un repo con su AGENTS.md propio, HOME y CODEX_HOME falsos.
printf '# Nuestro AGENTS.md\n\nTEXTO-DE-LA-EMPRESA\n' > "$REPO/AGENTS.md"
node engine/cli/ops.js init "$REPO" --name P --mode embedded --no-install --force
node engine/cli/ops.js automation install "$REPO" claude
node engine/cli/ops.js automation install "$REPO" codex
node engine/cli/ops.js upgrade "$REPO"
```

El script que lo corre midiendo cada paso está en el scratchpad de la sesión que lo encontró (`repro-546.js`).

## Síntoma

```
init --force: 0
tras init: empresa=true editado=1
tras install claude: empresa=true editado=1
tras install codex: empresa=true editado=0
upgrade: 0 − AGENTS.md: se reemplazó entero y con él las instrucciones de codex
tras upgrade: empresa=false editado=0
```

`empresa` dice si el texto de la empresa sigue en el archivo; `editado`, si el manifiesto lo ve editado. Sin
`install codex`, el mismo `upgrade` conserva el archivo («= conservado AGENTS.md (editado localmente)»).

## Causa raíz

`engine/automation/index.js:384`: después de fusionar el bloque del runner en un archivo compartido que está en
`SYSTEM_FILES`, `install` lo vuelve a anotar con `M.recordPaths`. El comentario de arriba (`:378-382`) explica por qué
existe: sin eso, el `upgrade` siguiente le echaba a la empresa la edición que había hecho el bloque. Pero anota siempre,
también cuando el archivo ya estaba editado antes del bloque, y ahí blanquea una edición de verdad. La línea es del
2026-09-03.

## Fix propuesto

Volver a anotar sólo si el archivo no estaba editado antes de fusionar el bloque: `M.editedPaths(root, [own])` vacío
antes de escribir. Si estaba editado, se deja el digest anotado como está, y el archivo sigue viéndose editado.

## Tradeoffs

- **Es una quita** (R29): deja de anotar en un caso. Se sostiene con la reproducción de arriba lado a lado, antes y
  después, y con el control sin Codex.
- El caso inverso, un archivo sin editar al que el bloque cambia el digest, tiene que seguir anotándose: es la razón
  por la que existe la línea, y su prueba ya está (el comentario la nombra).
- Puede haber instancias que ya perdieron el texto así. No hay cómo recuperarlo desde Cauce; el historial de git de la
  empresa lo tiene, y el CHANGELOG debería decirlo.

## Contexto de descubrimiento

Revisión independiente del caso 532 (la cuenta de instrucciones que carga una sesión), el 2026-11-22: con la empresa
dueña de `AGENTS.md`, después de `install codex` su contenido se contaba como de Cauce. Buscando por qué apareció esto.

## Relacionados

- 532: cuenta lo de la empresa como de Cauce en este mismo estado. Se arregla solo con este caso.
