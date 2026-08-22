# OPS-005 — Distribuir el catálogo dentro del paquete

**Estado:** Aceptado
**Fecha:** 2026-08-22
**Responsable:** Cauce
**Reemplaza:** ninguna

> Decide cómo llegan los cargos y los equipos a una instancia. No decide qué contiene cada cargo.

## Contexto

Una instancia necesita el catálogo de cargos y equipos para resolver el `cast` de una tarea y para correr un
recorrido. Copiarlo en cada instalación lo vuelve un archivo del proyecto: deja de recibir mejoras, y dos
empresas creadas con seis meses de diferencia terminan con contratos distintos bajo el mismo nombre.

El catálogo tampoco es como el molde. `template/` se copia una vez y la empresa lo edita —es suyo—; un cargo
del sistema se mantiene acá y se mejora versión a versión [fuente: OPS-002-runtime-autocontenido-y-neutral-al-runner.md].

## Decisión

**El catálogo viaja dentro del paquete y se resuelve desde ahí, no se copia a la instancia.** `ops agents fork`
existe para el caso contrario: cuando una empresa quiere apartarse de un cargo, lo copia y pasa a mantenerlo,
con una fila en su `HISTORY.md` que marca dónde termina lo nuestro y empieza lo suyo.

Lo que el paquete publica es el contrato de cada cargo —`SKILL.md`, `references/`, los casos de evaluación,
`sources.yaml` y `HISTORY.md`—. La evidencia de nuestras propias corridas queda fuera: informes, propuestas y
veredictos son lo que produjo nuestra versión del contrato, y una copia que los heredara recibiría una garantía
que no rindió.

## Alternativas consideradas

- **Copiar el catálogo en cada `init`:** cada instancia queda congelada en la versión del día que se creó, y
  `upgrade` no puede mejorarlo sin pisar lo que la empresa haya editado.
- **Resolverlo desde una API remota:** rompe que la instalación sea autocontenida y agrega una dependencia de
  red a una operación que hoy funciona sin conexión.

## Consecuencias

**Ganamos:**

- Un cargo del sistema mejora para todas las instancias con un `upgrade`, sin migración.
- `fork` es explícito: apartarse queda registrado en vez de ocurrir por deriva.

**Costos que aceptamos:**

- El peso del paquete es el del catálogo entero, aunque una empresa use tres cargos. Se acota publicando el
  contrato y no la evidencia, que es lo que lo hacía crecer sin techo.
- Un cargo del sistema no se puede editar en la instancia: hay que forkearlo, y eso es una decisión.

## Estado de implementación

Construido: el catálogo se resuelve desde el paquete, `fork` copia excluyendo informes, propuestas y veredictos,
y `files` en `package.json` deja fuera esas mismas rutas al publicar.

Pendiente: nada. La exclusión tiene prueba que corre `npm pack --dry-run` y verifica las dos mitades — que la
evidencia no viaje y que el contrato sí.
