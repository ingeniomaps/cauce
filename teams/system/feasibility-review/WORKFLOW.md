# Feasibility Review

## Cómo activarlo

Usar este equipo cuando hay una intención concreta y la pregunta es **si vale el esfuerzo**, no cómo
resolverla. Tres etapas y tres dueños de decisión: encuadre, factibilidad y recomendación.

```text
Usa el team feasibility-review para evaluar esta intención:
<qué se quiere lograr, para quién, y qué evidencia ya tenemos>
```

Si la respuesta requiere hablar con usuarios, medir algo que hoy no se mide o explorar el diseño, este
equipo no es el indicado: lo correcto es que recomiende investigar y que después corra
`product-development`, que sí tiene research y shape.

## Cuándo usar este y cuándo el largo

| | `feasibility-review` | `product-development` |
|---|---|---|
| Etapas de descubrimiento | 3 | 5 |
| Pregunta que responde | ¿vale el esfuerzo? | ¿qué construimos y cómo? |
| Evidencia | usa la que ya existe | produce evidencia nueva |
| Salida típica | hacer, no hacer o investigar | épica con criterios y diseño |

Un recorrido corto que termina en "hay que investigar" no falló: acotó el problema por el costo de tres
etapas en lugar de cinco.

## Protocolo de handoff

Cada handoff incluye:

```markdown
Etapa y agente:
Pregunta que resuelve:
Evidencia usada y su origen, como lista literal de lo consultado:
Supuestos e incertidumbre:
Lo que falta averiguar:
Exit gate: cumplido / no cumplido
Autorizaciones pendientes:
```

No avanzar si el exit gate no se cumple. La etapa siguiente puede devolver el handoff cuando falte
evidencia, autoridad o un criterio verificable.

Antes de usarlo, la etapa que recibe cruza lo afirmado contra esa lista: lo que cita algo que no está en ella
sigue viaje marcado, no borrado ni corregido en silencio (R14).

A la etapa siguiente viaja lo que necesita para decidir. El análisis completo queda en el artefacto que
la etapa produjo y lo lee sólo quien sintetiza al final: arrastrarlo lo hace costar una vez por etapa
en vez de una vez (R16).

## Selección de agentes condicionales

`user-researcher` entra cuando el encuadre depende de una necesidad que nadie verificó.
`security-engineer` y `privacy-compliance-specialist`, cuando la opción toca autenticación, permisos o
datos personales. `finops-engineer`, cuando el costo de operar es parte de la decisión —típico si suma
inferencia de modelos—. `legal-counsel`, cuando hay compromiso contractual o afirmación pública.

Se incorporan por riesgo, no por rutina: sumar un cargo que no aporta diluye la revisión.

## Límites

El recorrido produce una recomendación, no una aprobación. Escribe la épica candidata en `roadmap/`
cuando la respuesta es hacer, y **nunca promueve al BACKLOG**: esa firma es humana. Cuando la respuesta
es investigar, la acción concreta queda en `planning/HUMAN_ACTIONS.md`; cuando es no hacer, el motivo y
qué lo cambiaría quedan en la sección Lecciones de `planning/INBOX.md`.
