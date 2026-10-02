---
caso: 237
titulo: el molde no trae procedimiento de QA
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 237 — PROTOCOL dice probar por el camino real en una línea, y no hay un procedimiento

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: ninguna entrada de `done/` de globex cita su `QA.md`, así que no hay evidencia de uso, sólo de que lo trajo de acme.

## Resumen

globex-ops y acme-ops tienen un `planning/QA.md` con nueve pasos: leer los criterios, elegir el ambiente por donde entra el usuario, comprobar que el cambio está desplegado, saber qué datos se gastan, ir por el camino real, devolver la configuración, separar lo preexistente corriendo sin el cambio, dar el veredicto por criterio y contrastar con R15.

## Reproducción

No hace falta: es la ausencia de un archivo.

## Síntoma

QA queda librado a la memoria de quien lo hace.

## Causa raíz

`template/planning/PROTOCOL.md` lo dice en una línea en la fase de QA; no existe `template/planning/QA.md`.

## Fix propuesto

Un `QA.md` de molde, sin los ejemplos de la empresa, citado desde PROTOCOL. Antes, ver si el contrato de `qa-engineer` ya lo cubre.

## Tradeoffs

- El contrato de `qa-engineer` puede cubrir parte: contrastar antes.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- `agents/roles/system/qa-engineer`.

## Cierre

Resuelto en 0.100.0.

- **Ver antes si el contrato de `qa-engineer` ya lo cubre** — se hizo. Cubre el método general: oráculos,
  riesgos, niveles de prueba, reproducibilidad. No cubre lo operativo de la fase: comprobar que el cambio está
  desplegado, el ambiente por donde entra el usuario, los datos que se gastan, devolver la configuración,
  separar lo preexistente, el veredicto por criterio y el contraste R15.
- **Un `QA.md` de molde, sin los ejemplos de la empresa, citado desde PROTOCOL** — se hizo:
  `template/planning/QA.md`, con nueve pasos que nombran sólo esa parte operativa y remiten al cargo para el
  método. La fase 11 de PROTOCOL lo cita, y ese texto viaja al preámbulo de cada fase de `autobuild`.
- **Que llegue también a las instancias existentes** — se hizo con `'upgrade'` en `TEMPLATE_OWN`. Se comprobó en
  `engine/cli/instance.js` que `upgrade` lo crea sólo si falta (`if (fs.existsSync(target)) continue`), así que
  el `QA.md` propio de globex o de acme no se pisa.
- **Tradeoff: el contrato de `qa-engineer` puede cubrir parte** — contrastado arriba. No se repite nada de él.

Prueba real: la puerta del repositorio, que comprueba que cada archivo nuevo del molde tenga dueño en
`TEMPLATE_OWN` y esté en el README de `planning/`, en verde con el archivo agregado. La regla de creación sin
pisar se leyó en el fuente y no se corrió un `upgrade` sobre una instancia con `QA.md` propio.
