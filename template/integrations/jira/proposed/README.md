# Propuestas locales para Jira

Cada archivo representa un item que todavía no existe en Jira:

```markdown
---
provider: jira
state: draft
parent: KEY-123
type: Task
service: app
estimateHours: 2
---

# Resultado observable

## Descripción

Comportamiento que debe entregar el item.
```

Estados: `draft`, `approved`, `published`. Cauce valida y muestra el plan; nunca publica propuestas.
