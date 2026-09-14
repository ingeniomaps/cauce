# Reglas transversales

`system/` pertenece a Cauce y se reemplaza completo en cada actualización:

- `system/process.md` — R1..R4, R16, R17, R20..R22: planificación, alcance, review, sincronización de
  estado, medición y retomar lo interrumpido.
- `system/code-shape.md` — R5..R7, R11, R18: simplicidad y forma del cambio.
- `system/commits.md` — R8..R10: historia versionada y entrega.
- `system/conduct.md` — R12..R15, R19, R23: trato con sistemas externos, lo que llega de ellos, lo que
  se destruye, y la obligación de entregar al negarse.

El número es el identificador: una regla se cita por él desde un cargo, un workflow o una entrada de
DONE, y por eso no se reordena ni se reusa.

Las reglas propias del proyecto van en este directorio, junto a `system/`, y nunca se tocan al
actualizar. **Se numeran `P1..Pn`**: `R` queda reservado al sistema, y `check` rechaza un `R` definido
fuera de él para que no existan dos reglas con el mismo nombre.

Para cambiar una regla del sistema, escribí la tuya **con el mismo nombre de archivo**: ahí redefinir
sus números es la función, la del proyecto manda, y `check` reporta el override en vez de fallar.

Lo que reemplaza es **el archivo entero, no las reglas que mencionás**: las que ese archivo del sistema
definía y el tuyo no redefine dejan de regir para tu proyecto. Alguna la sigue exigiendo el motor —R17
lo hace—, y ahí queda exigida sin estar escrita en ningún lado. Por eso `check` te dice cuáles son
—«deja de regir R2, R17…»— y por eso conviene, antes de sobrescribir un archivo, mirar si lo tuyo era
una regla nueva: si lo era, va acá al lado como `P1..Pn` y no se lleva nada puesto.

Las convenciones específicas de lenguaje viven junto al servicio que usa ese lenguaje.

## Una regla que sólo rige sobre una superficie

Toda regla de este directorio se carga en el contexto de arranque de **cada** agente, y eso cuesta: sólo
lo que trae Cauce son ~16 K tokens por agente, medido. Una regla propia de dos páginas que importa en una
tarea de cada cien se lee cien veces.

Una regla puede declarar a qué superficie pertenece, y entonces se **nombra** sin cargarse:

```markdown
---
aplica: pagos
---

# Pagos

## P3 — Conciliar antes de cerrar
```

Qué cambia: el bloque que `automation install` escribe la lista —`- ruta (aplica: pagos)`— en vez de
importarla, así que pesa una línea y no su archivo entero. Sigue rigiendo igual: `ops context` la devuelve
entre las reglas del proyecto, el recorrido se la nombra a cada agente que toca código, y quien trabaje
sobre esa superficie la lee antes de planificar o construir.

**Sin el campo, la regla se carga siempre.** Es el default a propósito: una regla que no se leyó no existe,
así que apartarla del arranque es una decisión del proyecto y nunca algo que se deduzca. Por lo mismo el
valor es libre y lo elige quien escribe la regla —`pagos`, `infraestructura`, `el front`—: lo que tiene que
hacer es que quien lo lea sepa cuándo le toca.

Conviene para lo que es de un dominio acotado —un proveedor, un stack, una integración— y no para lo que
gobierna cómo se trabaja: esas se pagan y se cargan.
