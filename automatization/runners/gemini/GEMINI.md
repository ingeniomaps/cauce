# Cauce para Gemini CLI

@{{OPS_DIR}}AGENTS.md
@{{OPS_DIR}}planning/PROTOCOL.md
@{{OPS_DIR}}planning/rules/system/process.md
@{{OPS_DIR}}planning/rules/system/code-shape.md
@{{OPS_DIR}}planning/rules/system/commits.md
@{{OPS_DIR}}planning/rules/system/conduct.md

`{{OPS_DIR}}planning/PROTOCOL.md` es la fuente de verdad. Ejecuta `/cauce:autobuild` fase por fase; los
workflows JS de Claude son referencia, no un runtime compatible. `{{OPS_DIR}}planning/WIP.md` es el mutex
y `{{OPS_DIR}}planning/AWAITING_REVIEW.md` bloquea una corrida nueva.

Los hooks de `.gemini/settings.json` son obligatorios y bloquean por su cuenta. **Requieren que la
carpeta esté marcada como confiable**: si no lo está, Gemini los desactiva y avisa con
`Project hooks disabled because the folder is not trusted`, y entonces nada te detiene. Confía en la
carpeta antes de trabajar.

Los cargos llegan como skills en `.gemini/skills/`. Cada uno conserva nombre y descripción, y remite al
contrato completo; leé ese `SKILL.md` antes de actuar en su terreno. Para la lista:

```bash
node {{OPS_DIR}}tools/ops.js agents list
node {{OPS_DIR}}tools/ops.js team list
```

## El arranque

En una instancia recién creada nadie le explicó todavía al toolkit qué es este proyecto:
`{{OPS_DIR}}organization/` llega como molde y el roadmap está vacío. El primer recorrido lo llena, y una
vez: reescribir un contexto que alguien ya corrigió no deja rastro de lo que se perdió.

Empezá por `node {{OPS_DIR}}tools/ops.js onboard`, que es instantáneo: la primera línea que imprime es la
pregunta con la que tenés que abrir —de qué trata el proyecto—. Hacésela tal cual y esperá la respuesta
antes de mirar el inventario, sea el workspace vacío, un monorepo o diez repos. Con lo que te conteste
invocá `/cauce:onboard`, que lleva el recorrido entero y la lista de lo que se comprueba al final;
invocarlo antes sólo devuelve la misma pregunta más caro.

El arranque tiene tres objetivos y ninguno más: entender qué es el proyecto, dejar la instancia correcta
para él y que la primera tarea pueda empezar. El análisis profundo viene después, cuando la persona pida
algo concreto. Estar bloqueado es un resultado legítimo; narrarlo como entrega, no.

Nunca omitas aprobaciones, inventes credenciales, escribas remoto, hagas push/deploy o promociones
trabajo desde INBOX.

> No corras `gemini hooks migrate --from-claude`: reescribe `.gemini/settings.json` entero y se lleva
> puesto el resto de la configuración. `cauce automation install . gemini` ya deja los hooks puestos.
