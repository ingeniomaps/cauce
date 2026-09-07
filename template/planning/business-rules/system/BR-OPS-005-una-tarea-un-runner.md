# Una tarea, un runner

> **Dominio:** planning | **Estado:** vigente | **Actualizado:** 2026-09-07

El reclamo protege la exclusión mutua entre runners y hace visible quién sostiene cada tarea.
[fuente: ../../adr/system/OPS-001-planificacion-como-fuente-de-verdad.md]

Es la contracara de `BR-OPS-001-una-sola-tarea-activa.md`, y las dos juntas son el invariante 2 de
`../../PROTOCOL.md`. Se parecen y no son la misma: aquélla impide que un runner lleve dos tareas y vive
en su `WIP.md`, que es local; ésta impide que dos runners lleven la misma y vive en `claims/`, que es
compartido. Con una sola, un equipo trabaja una tarea por vez o duplica trabajo sin enterarse.

## Reglas

| ID | Regla | Condición y resultado |
|---|---|---|
| BR-OPS-005 | El reclamo reserva | Una tarea reclamada no se ofrece a otro runner ni se toma hasta que su reclamo se suelte. |

## Por qué existe cada regla

- **BR-OPS-005:** sin reserva, dos runners que preguntan a la vez reciben la misma tarea y ninguno lo
  nota: el trabajo se duplica y el conflicto aparece recién al mergear, cuando ya se pagó dos veces.

## Casos borde

| Caso | Comportamiento esperado |
|---|---|
| Reclamo propio | Se continúa esa tarea; es lo que el runner declaró que iba a hacer. |
| Reclamo de otro | La tarea no se ofrece; se toma la siguiente libre. |
| Reclamo sin empujar | No protege a nadie: el otro runner lee lo que hay en su copia. |
| Reclamo abandonado | Se avisa por antigüedad; soltarlo es un acto humano, no un comando. |
| Tarea ya en DONE | El reclamo sobra y se avisa; la evidencia no depende de él. |

## Evidencia

- `ops context` no devuelve una tarea con reclamo ajeno y nombra quién la tiene.
- `ops check` rechaza un reclamo cuya tarea no existe en BACKLOG ni DONE.
- `ops claim` se niega a pisar el reclamo de otro.

## Historial

| Fecha | Cambio | Origen |
|---|---|---|
| 2026-09-07 | Creación | Trabajo en equipo: `../../delivery/teamwork.md`. |
