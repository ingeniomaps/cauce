# Decisiones de arquitectura

Las ADR conservan decisiones durables y su razonamiento. No sustituyen tareas, reglas de código ni hechos de
negocio. Una decisión interna de un servicio debe vivir junto a ese servicio; aquí van decisiones del proyecto
como conjunto o que cruzan sus límites.

## Namespaces

- `system/OPS-NNN-*`: decisiones heredadas de Cauce. Explican el protocolo instalado y no se renumeran.
- `NNN-*`: decisiones propias del proyecto, numeradas correlativamente desde `001`.
- `000-template.md`: molde para una decisión nueva; no representa una decisión vigente.

Las ADR del sistema se conservan para que la instalación sea autocontenida. Si un proyecto necesita apartarse
de una, crea una ADR propia que documente la excepción; no modifica silenciosamente la heredada.

## Estados

- `Propuesto`: decidido pero aún no implementado o pendiente de aprobación.
- `Aceptado`: vigente, con implementación o transición descrita honestamente.
- `Obsoleto`: desaconsejado, aunque todavía pueda existir en el sistema.
- `Reemplazada por [NNN]`: sustituido por otra decisión; el archivo original no se elimina.

## Cómo crear una ADR del proyecto

1. Copiar `000-template.md` como `NNN-slug-corto.md`.
2. Documentar contexto, fuentes, supuestos, decisión, alternativas y costos.
3. Declarar por separado lo construido y lo pendiente.
4. Actualizar el índice siguiente.
5. Al reemplazarla, enlazar la nueva ADR sin borrar el historial.

## Decisiones del sistema

- [OPS-001](system/OPS-001-planificacion-como-fuente-de-verdad.md): planning conserva intención y estado.
- [OPS-002](system/OPS-002-runtime-autocontenido-y-neutral-al-runner.md): runtime portable y neutral.
- [OPS-003](system/OPS-003-integraciones-seguras-por-staging.md): integraciones mediante staging seguro.
- [OPS-004](system/OPS-004-promocion-humana-y-evidencia-verificable.md): promoción controlada y verificable.

## Decisiones del proyecto

| ADR | Decisión | Fecha | Estado |
|---|---|---|---|
| _(ninguna todavía)_ | | | |
