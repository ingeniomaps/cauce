# Flujo operativo

```text
INBOX ──promoción humana──▶ roadmap ──historias listas──▶ BACKLOG
  ▲                                                           │
  │                                                        Pick/Plan
  │                                                           ▼
  │      done/ ◀── archive ◀── DONE ◀── Verify/QA ◀────────── WIP
  │                                                           │
  └───────────── deuda adyacente ─────────────────────────────┤
                                                              │
              AWAITING_REVIEW ◀── checkpoint de hito ─────────┤
               HUMAN_ACTIONS ◀── lo que decide una persona ───┘
```

## Preparar

1. Curar una idea desde INBOX.
2. Escribir una épica con resultados observables, contexto actual y criterios `C1..CN`.
3. Descomponerla en historias de máximo cuatro horas, cada una rastreada a uno o más criterios.
4. Promover historias a un hito de BACKLOG sin cambiar su slug ni aceptación.

## Ejecutar

La máquina de fases vive en `PROTOCOL.md`. Acá va lo que no se ve en ella.

Los gates de arranque y la elección de tarea salen de un comando —`node tools/ops.js context
planning`—, no de leer el estado a mano: si imprime `BLOCKED`, parar con la razón que nombra; si
imprime una tarea, ésa es la que corresponde, ya con su aceptación y sus criterios. `--json` la
entrega a un workflow.

Las dos flechas que salen del carril son las del diagrama: lo que aparece durante el trabajo y no
entra en la tarea vuelve al INBOX, y lo que necesita a una persona va a `HUMAN_ACTIONS.md` y para esa
línea de trabajo.

## Cerrar

Al terminar la última historia, cambiar la épica a `closed`, archivar su evidencia y ejecutar el check.
Cruzar a otro hito crea `AWAITING_REVIEW.md` si la configuración exige checkpoint humano.
