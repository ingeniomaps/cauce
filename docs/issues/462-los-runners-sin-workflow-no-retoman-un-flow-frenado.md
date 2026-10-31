---
caso: 462
titulo: Los runners que corren /flow por instrucciones y no por workflow no tienen cómo retomar un recorrido frenado en un gate
estado: aplazado
reabrir-si: una instancia cuenta un recorrido de Codex, Gemini o Antigravity relanzado entero después de contestar un gate en otra sesión
prioridad: baja
version-detectada: 0.118.0
---

# 462 — Los runners sin workflow no retoman un flow frenado

**⏸ aplazado** · detectado en 0.118.0 · prioridad **baja**: es la misma pérdida que el 458 arregló para Claude Code
—relanzar paga otra vez lo que ya cerró—, pero en runners donde el recorrido corre dentro de una sola conversación,
y ahí casi siempre la persona contesta en la misma sesión, que sigue sola. Sube a media el día que una instancia
cuente un recorrido de Codex, Gemini o Antigravity relanzado entero después de contestar un gate en otra sesión.

## Resumen

Desde 0.118.0, un `/flow` de Claude Code que frena en un gate deja una retoma sellada en `planning/reports/`, y se
retoma con `{"resume", "answers"}` sin volver a pagar las etapas cerradas (caso 458). Eso vive en
`automatization/workflows/flow.js`, y sólo Claude Code corre ese workflow. Codex y Antigravity siguen
`shared/skills/flow/SKILL.md`, y Gemini sigue `runners/gemini/commands/cauce/flow.toml`. Los dos textos dicen que al
frenar se registre la acción humana y se detenga, y nada más: no dejan qué etapas cerraron ni cómo seguir. Una
sesión nueva arranca el recorrido desde `flow show`, es decir, desde la primera etapa.

## Reproducción

No se corrió en una sesión real de esos runners: el hueco se ve en el texto que reciben. Lo que se comprobó es qué
recibe cada runner:

```bash
grep -n "skills/flow\|commands/cauce/flow" automatization/runners/*/manifest.json
```

```
automatization/runners/codex/manifest.json:27:      "source": "../../shared/skills/flow/SKILL.md",
automatization/runners/antigravity/manifest.json:41:      "source": "../../shared/skills/flow/SKILL.md",
automatization/runners/gemini/manifest.json:33:      "source": "commands/cauce/flow.toml",
```

## Síntoma

`automatization/shared/skills/flow/SKILL.md:11-13`:

```
Marcá el exit gate de una etapa como cumplido sólo si se cumple de verdad. Cuando falte evidencia,
autoridad o una decisión externa, registrá la acción concreta en `{{OPS_DIR}}planning/human/`, un archivo por acción, y detente:
una opinión del modelo no es investigación de usuarios ni valida un problema.
```

`automatization/runners/gemini/commands/cauce/flow.toml:7-9` dice lo mismo. Ninguno de los dos menciona
`planning/reports/`, la retoma ni qué hacer al volver.

## Causa raíz

La retoma del 458 se construyó en el workflow (`automatization/shared/flow-resume.js` y `flow.js`), y los runners sin
workflow no lo ejecutan: siguen el texto de arriba, escrito antes de que existiera retomar.

## Fix propuesto

Que el texto de esos runners use lo que el motor ya ofrece:

1. **Al frenar**, escribir la retoma con la misma forma que la del workflow y sellarla con el motor. Hoy `ops flow
   resume save` exige la suma que calcula el workflow (`--hash`), y un agente siguiendo instrucciones no puede
   calcularla. Haría falta una variante que la calcule el motor —sin comparar, porque no hay un original contra el
   cual comparar—, y decir que en ese camino la suma sólo protege contra una edición posterior, no contra la copia.
2. **Al arrancar**, si el pedido trae una retoma o una respuesta a un gate, leerla con `ops flow resume show`,
   saltear las etapas cerradas y relanzar la que frenó con la respuesta.

## Tradeoffs

- Más texto en un `SKILL.md` que se carga en cada sesión de esos runners, para un caso que ahí es menos frecuente.
- Sin la suma calculada por el recorrido, la retoma de estos runners protege menos que la de Claude Code, y eso
  tiene que quedar dicho donde se usa.

## Contexto de descubrimiento

Al cerrar el 458, recorriendo qué runners reciben `flow`.

## Relacionados

- 458 — la retoma en el workflow de Claude Code, de donde sale el motor que este caso reusaría.

## Aplazado

Decidido el 2026-10-31. Agrega texto que esos runners cargan en cada sesión, y una variante de `ops flow resume save` que protege menos que la de Claude Code, para un caso que nadie contó todavía. La condición para reabrirlo es la que este mismo caso escribió para subir de prioridad.
