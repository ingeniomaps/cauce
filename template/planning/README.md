# Planning — intención, estado y evidencia

## Estado de la corrida

Se lee y se escribe en cada tarea.

| Pieza | Responsabilidad |
|---|---|
| `BACKLOG.md` | Única cola de tareas promovidas y listas. |
| `WIP.md` | Única tarea en vuelo; recuperación y mutex. |
| `DONE.md` | Evidencia activa de tareas terminadas. |
| `HUMAN_ACTIONS.md` | Acciones externas que requieren una persona. |
| `AWAITING_REVIEW.md` | Gate efímero; mientras existe no inicia trabajo. |

## Intención y horizonte

Se decide antes de ejecutar y no cambia dentro de una tarea.

| Pieza | Responsabilidad |
|---|---|
| `INBOX.md` | Ideas y deuda sin autorización de ejecución. |
| `roadmap/` | Especificaciones de épicas y criterios del QUÉ. |
| `adr/` | Decisiones arquitectónicas durables. |
| `business-rules/` | Invariantes observables de negocio y operación. |
| `delivery/` | Camino objetivo para ramas, ambientes, releases y rollback. |
| `rules/` | Reglas transversales de craft. |

## Historial

Evidencia que no se reescribe.

| Pieza | Responsabilidad |
|---|---|
| `done/` | Historial inmutable: una épica cerrada por archivo, más las acciones humanas resueltas. |
| `reports/` | Informes de recorridos de equipo. |

El protocolo exacto está en `PROTOCOL.md`, la explicación visual en `FLOW.md` y los principios que
sostienen a los dos en `METHODOLOGY.md`.
