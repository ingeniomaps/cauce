# Reglas transversales

`system/` pertenece a Cauce y se reemplaza completo en cada actualización:

- `system/process.md`: planificación, alcance, review y sincronización de estado.
- `system/code-shape.md`: simplicidad y forma del cambio.
- `system/commits.md`: historia versionada y entrega.
- `system/conduct.md`: trato con sistemas externos y obligación de entregar al negarse.

Las reglas propias del proyecto van en este directorio, junto a `system/`, y nunca se tocan al
actualizar. Para cambiar una regla del sistema, escribí la tuya con el mismo nombre: la del proyecto
manda y `check` reporta el override en vez de fallar.

Las convenciones específicas de lenguaje viven junto al servicio que usa ese lenguaje.
