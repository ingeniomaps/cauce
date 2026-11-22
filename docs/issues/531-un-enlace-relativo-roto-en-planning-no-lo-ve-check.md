---
caso: 531
titulo: un enlace relativo roto en `planning/` u `organization/` no lo ve `check`
estado: abierto
prioridad: baja
version-detectada: 0.123.1
---

# 531 — un enlace relativo roto en `planning/` u `organization/` no lo ve `check`

**🔴 abierto** · detectado en 0.123.1 · prioridad **baja**: medido en dos instancias reales, el daño es chico (3
enlaces reales rotos en una, ninguno en la otra). Sube a media si un `upgrade` mueve o parte archivos del molde que las
reglas propias de una empresa enlazan.

## Resumen

Una regla, una ADR o un documento de `organization/` que enlaza `[texto](../otra/ruta.md)` a un archivo que ya no
existe pasa `check` en verde. Pasa sobre todo al partir o mover reglas, que es justamente lo que una empresa hace al
adaptar el molde y lo que `upgrade` puede hacer con los archivos de Cauce.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
printf '\n## R90 — Prueba\n\nVer [la guía](../docs/no-existe.md) y [el protocolo](../PROTOCOL.md#no-existe).\n' \
  >> planning/rules/README.md
echo '- Ver [diseño](./diseno-borrado.md).' >> planning/METHODOLOGY.md
node tools/ops.js check planning; echo "exit=$?"
```

## Síntoma

```
⚠ 2 archivo(s) del molde congelados por edición local; `upgrade` los conserva y no les trae mejoras
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
exit=0
```

Medido con un contador de sólo lectura (enlaces `](ruta)` relativos, fuera de bloques de código, saltando `done/` y
`archive/`):

| Dónde | Archivos | Enlaces | Rotos | Reales |
|---|---|---|---|---|
| `template/` de Cauce | 67 | 13 | 1 | 0 (el `NNN-slug.md` de la plantilla de ADR) |
| instancia A, `planning/` + `organization/` (con chequeo propio) | 1236 | 303 | 4 | 3, en su carpeta de historia |
| instancia B, ídem (sin chequeo) | 299 | 281 | 2 | 0 (dos placeholders de plantilla) |

## Causa raíz

No hay chequeo: un grep de `enlace roto`, `broken link` y `doc-links` en `engine/` y `test/` sólo encuentra un
comentario sobre un symlink (`engine/cli/lines.js:121`). `test/repo/template-docs.test.js:57` comprueba que el índice de
un documento del molde tenga sus anclas, no que los enlaces apunten a algo.

## Fix propuesto

Un chequeo en `check` sobre `planning/` y `organization/`: error si el archivo enlazado no existe, aviso si existe y le
falta el ancla. Excluye `done/`, `archive/`, los bloques de código y los placeholders de plantilla (`NNN-slug.md`,
`{{…}}`, el `000-template.md` de las ADR).

## Tradeoffs

- Una instancia con enlaces viejos pasa a rojo de una vez al actualizar. Con 3 de 303 en la peor medida, el costo es
  bajo, pero conviene que arranque como aviso o con la línea de base de adopción (`engine/planning/adoption.js`).
- El ancla depende de cómo se genera el slug de un encabezado (acentos, `—`). Si el slugificado del motor no coincide
  con el del visor, aparecen falsos rojos; por eso el ancla va como aviso.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que escribió su propio chequeo después de partir reglas.
En su primera corrida encontró un enlace roto real. Sus 3 rotos de hoy están en la carpeta que ese chequeo excluye.

## Relacionados

Ninguno: los casos con «enlace» en el cuerpo hablan de symlinks (408, 420).
