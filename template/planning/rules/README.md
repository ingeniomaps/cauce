# Reglas transversales

`system/` pertenece a Cauce y se reemplaza completo en cada actualización:

- `system/process.md` — R1..R4, R16: planificación, alcance, review y sincronización de estado.
- `system/code-shape.md` — R5..R7, R11: simplicidad y forma del cambio.
- `system/commits.md` — R8..R10: historia versionada y entrega.
- `system/conduct.md` — R12..R15: trato con sistemas externos y obligación de entregar al negarse.

El número es el identificador: una regla se cita por él desde un cargo, un workflow o una entrada de
DONE, y por eso no se reordena ni se reusa.

Las reglas propias del proyecto van en este directorio, junto a `system/`, y nunca se tocan al
actualizar. **Se numeran `P1..Pn`**: `R` queda reservado al sistema, y `check` rechaza un `R` definido
fuera de él para que no existan dos reglas con el mismo nombre.

Para cambiar una regla del sistema, escribí la tuya **con el mismo nombre de archivo**: ahí redefinir
sus números es la función, la del proyecto manda, y `check` reporta el override en vez de fallar.

Las convenciones específicas de lenguaje viven junto al servicio que usa ese lenguaje.
