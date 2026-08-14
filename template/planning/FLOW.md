# Flujo operativo

```text
INBOX ──promoción humana──▶ roadmap ──historias listas──▶ BACKLOG
                                                              │
                                                           Pick/Plan
                                                              ▼
                         done/ ◀── archive ◀── DONE ◀── Verify/QA ◀── WIP
```

## Preparar

1. Curar una idea desde INBOX.
2. Escribir una épica con resultados observables, contexto actual y criterios `C1..CN`.
3. Descomponerla en historias de máximo cuatro horas, cada una rastreada a uno o más criterios.
4. Promover historias a un hito de BACKLOG sin cambiar su slug ni aceptación.

## Ejecutar

1. Comprobar gates (`AWAITING_REVIEW`, WIP ajeno, acciones humanas).
2. Tomar la primera tarea no bloqueada.
3. Persistir el plan aprobado en WIP antes de editar código.
4. Construir con RED/GREEN/VERIFY cuando sea aplicable.
5. Revisar, verificar y hacer QA con evidencia real.
6. Commit por tarea; mover BACKLOG → DONE; limpiar WIP.

Los pasos 1 y 2 los resuelve `node tools/ops.js context planning` en una sola salida: si imprime
`BLOCKED`, parar; si imprime una tarea, ésa es la que corresponde, ya con su aceptación y sus
criterios. Añadir `--json` para consumirlo desde un workflow.

## Cerrar

Al terminar la última historia, cambiar la épica a `closed`, archivar su evidencia y ejecutar el check.
Cruzar a otro hito crea `AWAITING_REVIEW.md` si la configuración exige checkpoint humano.
