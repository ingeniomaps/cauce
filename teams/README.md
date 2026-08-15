# Equipos

Un equipo compone varios cargos de `agents/` en un recorrido con etapas, dueños de decisión y gates de
salida. Es lo que convierte una intención en una épica candidata —o en la razón por la que todavía no
lo es— sin que un solo agente decida por todos.

## Los que trae Cauce

| Equipo | Descubrimiento | Para qué |
|---|---|---|
| `system/feasibility-review` | 3 etapas | ¿vale el esfuerzo? Con la evidencia que ya existe. |
| `system/product-development` | 5 etapas | ¿qué construimos y cómo? Produce evidencia nueva. |

Son dos **formas**, no dos dominios. Un equipo de seguridad o uno de crecimiento tienen la misma forma
con otros cargos: eso lo escribe cada empresa, porque cómo decide es suyo.

## Escribir uno propio

Copiar la estructura de [000-template.md](000-template.md) a `teams/<slug>/`, con su `team.json` y su
`WORKFLOW.md`, y validar:

```bash
node tools/ops.js team list
node tools/ops.js team check <slug>
node tools/ops.js team show <slug>
```

Un equipo propio con el mismo slug que uno de `system/` lo reemplaza; con otro slug, convive. **Nunca
editar dentro de `system/`**: se reemplaza completo en cada actualización.

Para correrlo:

```text
/team {"team": "<slug>", "intent": "qué se quiere evaluar"}
```

## Corto o largo

Un recorrido largo cuesta más y aporta más certeza. La elección es la misma que con los lanes de una
tarea: usar el corto cuando la evidencia ya existe y la pregunta es de esfuerzo, y el largo cuando hay
que averiguar algo antes de comprometerse.

Un recorrido corto que termina en "hay que investigar" no falló: acotó el problema por el costo de tres
etapas en lugar de cinco.

## Lo que un equipo nunca hace

Ningún recorrido promueve trabajo al BACKLOG. Escribe la épica candidata en `planning/roadmap/` y para;
la promoción es la firma humana que autoriza ejecución. Un gate que no se cumple se convierte en una
acción concreta en `planning/HUMAN_ACTIONS.md`, no en un gate más blando.
