# Planning — intención, estado y evidencia

## Estado de la corrida

Se lee y se escribe en cada tarea.

| Pieza | Responsabilidad |
|---|---|
| `BACKLOG.md` | Cola de tareas promovidas y listas, junto con `backlog/`. |
| `backlog/` | Un archivo por hito, con su `order`; para que dos líneas de trabajo no escriban el mismo archivo. |
| `wip/` | El plan en vuelo de cada runner; recuperación y mutex por runner. No viaja por git. |
| `claims/` | Qué tarea tomó cada quien; un archivo por tarea. |
| `HUMAN_ACTIONS.md` | Acciones externas que requieren una persona. |
| `checkpoints/` | Un archivo por hito terminado que espera revisión; frena a la línea que lo escribió hasta que diga `resuelta`. |
| `AWAITING_REVIEW.md` | Freno de toda la instancia, escrito a mano; mientras no diga `resuelta` ninguna línea inicia trabajo. |
| `QA.md` | Cómo se prueba una entrega en la fase QA, paso por paso. |
| `gate-known-red` | Opcional. Los gates que ya estaban en rojo, `<raíz>: <gate> — <motivo>`: `verify` no frena el commit por ellos y `check` los lista mientras sigan ahí. |

## Intención y horizonte

Se decide antes de ejecutar y no cambia dentro de una tarea.

| Pieza | Responsabilidad |
|---|---|
| `INBOX.md` | Ideas y deuda sin autorización de ejecución. |
| `inbox/` | Las mismas entradas, una por archivo: lo que escriben los recorridos. |
| `LESSONS.md` | Reglas que la revisión mandó a corregir en varias tareas, y qué se decidió con cada una. |
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
