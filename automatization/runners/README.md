# Adaptadores de runners

Cada adaptador traduce el mismo toolkit al espacio de nombres de su herramienta. Lo que declara su
`manifest.json`:

| Campo | Qué resuelve |
|---|---|
| `command` | el ejecutable con el que se comprueba que la herramienta esté disponible |
| `config` | de qué archivo sale el wiring de hooks y en qué ruta del proyecto se instala |
| `instructions` | qué archivo de contexto se copia, si la herramienta lee uno propio |
| `artifacts` | los recorridos y cualquier archivo que el adaptador aporte |
| `capabilities` | qué ejecuta de verdad —`nativeHooks`, `nativeWorkflows`, `nativeSkills`, `checkpointing`, `projectInstructions`— y qué queda como protocolo manual |
| `roleSkills` | dónde se instala el catálogo de cargos, cuando la herramienta tiene skills |
| `activation` | el paso manual que lo pone a correr, cómo verificarlo y qué se espera ver |
| `commands` | los nombres de los recorridos y con qué prefijo se los invoca acá |

Lo que un adaptador **no** declara es qué acciones requieren confirmación humana: eso no varía por
runner. Lo fijan los guards de `automatization/hooks/` y las reglas de `planning/rules/system/`, iguales
para los cuatro.

```text
runners/<nombre>/
├── README.md
├── manifest.json
├── settings.json | hooks.json      configuración del runner, según lo que lea cada uno
├── archivo de instrucciones        CLAUDE.md, GEMINI.md, AGENTS.md (si aplica)
└── artefactos propios              comandos, skills, reglas, puentes (si aplica)
```

Adaptadores incluidos: `claude`, `codex`, `antigravity` y `gemini`. Antigravity es la opción Google
recomendada para cuentas individuales y proyectos nuevos; Gemini se conserva para Enterprise, Google
Cloud y autenticación mediante API keys.

Se instalan explícitamente —crear el proyecto no toca la configuración activa del usuario— y se
comprueban sin autenticar:

```bash
node tools/ops.js automation install . <runner>
node tools/ops.js automation doctor . <runner>
```

`doctor` verifica configuración, instrucciones, artefactos, cargos y disponibilidad del CLI.
