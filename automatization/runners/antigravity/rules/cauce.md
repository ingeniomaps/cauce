# Cauce

Lee y cumple `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` y las reglas que rigen este proyecto
antes de ejecutar trabajo: las propias y las de `system/` que el proyecto no sobrescribió. Donde una propia
contradice a una del sistema, rige la propia.

{{RULES:list}}

`{{OPS_DIR}}planning/wip/<runner>.md` es el mutex de
ejecución y `{{OPS_DIR}}planning/AWAITING_REVIEW.md` bloquea una corrida nueva. No promociones ideas desde INBOX, no
inventes aprobaciones o credenciales y no hagas push ni deploy. Cierra cada tarea con verificación real y
evidencia en DONE.
