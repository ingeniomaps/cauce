# Defect Triage

## Cómo activarlo

Usar este equipo cuando **el defecto está vivo**: alguien lo está sufriendo ahora y todavía no se sabe
cuánto alcanza ni por qué empezó.

```text
Usa el team defect-triage para este defecto:
<qué se reporta, desde cuándo, en qué versión y qué se intentó ya>
```

## Cuándo usar este y cuándo `incident-review`

| | `defect-triage` | `incident-review` |
|---|---|---|
| Estado del problema | vivo, sin contener | ya contenido |
| Pregunta | ¿a quién alcanza y qué hacemos ahora? | ¿qué aprendimos y qué lo evita? |
| Urgencia | la exposición corre mientras se investiga | ninguna: el fuego se apagó |
| Salida | contener, encolar o no arreglar | aprendizaje verificable |

Son consecutivos, no alternativos: un defecto grande se tría hoy y se revisa después. Correr el
post-mortem sobre algo que sigue sangrando produce la peor versión de los dos.

## La forma del recorrido

```text
                        ┌─ contain (SRE)              ─┐
reproduce (qa-engineer)─┤                              ├─→ decide (release-manager)
                        └─ locate  (backend-engineer) ─┘
```

Contención y causa dependen de la reproducción y **de nada más entre sí**: corren en paralelo a
propósito. Esperar la causa para contener alarga la exposición, y contener no cancela la
investigación — la contención tapa el síntoma, y el síntoma tapado es exactamente el que después
nadie vuelve a mirar.

## Lo que este equipo no hace

- **No toca producción.** No despliega, no apaga banderas, no revierte. Recomienda; la ejecución la
  autoriza una persona.
- **No cierra una causa.** Una causa que explica el síntoma pero no explica **por qué empezó ahora**
  está incompleta, y se entrega diciéndolo.
- **No convierte «no reproduje» en «no existe».** La entrega es qué se intentó y qué falta.
- **No esconde el «no arreglar».** Cuando el alcance y el riesgo lo sostienen, es una recomendación
  legítima y va con esos números a la vista.

## Agentes condicionales

| agente | cuándo |
|---|---|
| `customer-support-specialist` | el reporte viene de clientes y hace falta el caso original sin interpretar |
| `security-engineer` | el defecto expone datos, permite acceso indebido o huele a explotación activa |
| `database-administrator` | hay dato corrupto, migración sospechada o la contención toca el motor |
| `mobile-engineer` | el defecto vive en la app y las versiones viejas en la calle limitan la contención |
| `frontend-engineer` | el defecto se ve en el cliente y hay que separar render de contrato |
