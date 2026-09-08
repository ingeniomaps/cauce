# Planning — intención, estado y evidencia

## Estado de la corrida

Se lee y se escribe en cada tarea.

| Pieza | Responsabilidad |
|---|---|
| `BACKLOG.md` | Única cola de tareas promovidas y listas. |
| `WIP.md` | Tarea en vuelo del runner local; recuperación y mutex por runner. No viaja por git. |
| `claims/` | Qué tarea tomó cada quien; un archivo por tarea. |
| `HUMAN_ACTIONS.md` | Acciones externas que requieren una persona. |
| `AWAITING_REVIEW.md` | Gate efímero; mientras existe no inicia trabajo. |

## Intención y horizonte

Se decide antes de ejecutar y no cambia dentro de una tarea.

| Pieza | Responsabilidad |
|---|---|
| `INBOX.md` | Ideas y deuda sin autorización de ejecución. |
| `RECURRING.md` | Trabajo que vuelve cada tanto; declarado, nunca encolado solo. |
| `roadmap/` | Especificaciones de épicas y criterios del QUÉ. |
| `adr/` | Decisiones arquitectónicas durables. |
| `business-rules/` | Invariantes observables de negocio y operación. |
| `delivery/` | Camino objetivo para ramas, ambientes, releases y rollback. |
| `rules/` | Reglas transversales de craft. |

## Historial

Evidencia que no se reescribe.

| Pieza | Responsabilidad |
|---|---|
| `done/` | Evidencia de lo terminado: una tarea cerrada por archivo, más las acciones humanas resueltas. |
| `reports/` | Informes de recorridos de equipo. |

El protocolo exacto está en `PROTOCOL.md`, la explicación visual en `FLOW.md` y los principios que
sostienen a los dos en `METHODOLOGY.md`.
