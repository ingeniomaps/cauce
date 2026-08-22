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
- `Reemplazada por [NNN](NNN-slug.md)`: sustituido por otra decisión; el archivo original no se elimina.
  Se puede cerrar con la fecha del reemplazo entre paréntesis.

El estado se escribe elegido, nunca como lista de opciones: `check` rechaza la línea que todavía trae el
menú, porque una decisión que no dice si rige no decide nada. Por eso el molde nace en `Propuesto`.

Lo que una decisión reemplaza va en el encabezado, junto al estado. Los follow-ups van donde se ejecutan
—una tarea, una épica o el INBOX—, y lo construido contra lo pendiente en `## Estado de implementación`.

## Cómo crear una ADR del proyecto

1. Copiar `000-template.md` como `NNN-slug-corto.md`. El nombre lleva el número: es de donde sale la
   identidad con que se detecta un override, y por él se cita la decisión.
2. Documentar contexto, fuentes, supuestos, decisión, alternativas y costos.
3. Declarar por separado lo construido y lo pendiente.
4. Al reemplazarla, enlazar la nueva ADR sin borrar el historial.

No hay índice que mantener: las decisiones del proyecto son los archivos `NNN-*.md` de este
directorio, y su estado vive en cada uno. Una tabla que los repitiera envejecería aparte —y este
archivo lo mantiene Cauce, así que una fila agregada acá se perdería en el próximo `upgrade`.

## Decisiones del sistema

- [OPS-001](system/OPS-001-planificacion-como-fuente-de-verdad.md): planning conserva intención y estado.
- [OPS-002](system/OPS-002-runtime-autocontenido-y-neutral-al-runner.md): runtime portable y neutral.
- [OPS-003](system/OPS-003-integraciones-seguras-por-staging.md): integraciones mediante staging seguro.
- [OPS-004](system/OPS-004-promocion-humana-y-evidencia-verificable.md): promoción controlada y verificable.
