# Claude Code

Adaptador nativo mediante `PreToolUse`, `UserPromptSubmit` y `Stop`. Instalar con:

```bash
node tools/ops.js automation install . claude
```

El instalador fusiona la sección `hooks` en `.claude/settings.json` y conserva otras claves. Las reglas
`permissions.deny` `Read(...)` que Cauce sumaba hasta 0.80.0 las retira al reinstalar —las declara
`config.retired` en `manifest.json`— y deja las que el proyecto haya escrito: leer una credencial lo frenan
ahora los guards, y lo que la persona pide en el chat pasa (caso 104). Si ya
existe una versión distinta de un archivo, se detiene sin sobrescribirla para no destruir
personalizaciones del proyecto. También crea `CLAUDE.md` cuando no existe y conserva uno existente.

En `.claude/workflows/` deja los cinco recorridos que anuncia —`/onboard`, `/flow`, `/autobuild`,
`/integration-sync` e `/integration-promote`— y tres del ciclo de cargos que se invocan igual pero no
figuran en la lista de recorridos: `/agent-eval`, `/agent-propose` y `/agent-promote`. El catálogo de
cargos llega como skills en `.claude/skills/`.

`manifest.json` declara destinos y capacidades. Comprueba todo con
`node tools/ops.js automation doctor . claude`.

En `.claude/agents/` deja dos agentes que `autobuild` usa para lo que no es juzgar. No son cargos ni están
para pedirles trabajo.

`cauce-clerk` corre un comando del CLI y devuelve su salida: leer la cola, reclamar, soltar. Sólo tiene Bash y
no carga las instrucciones del proyecto (`omitClaudeMd`), porque en eso no hay nada que una regla cambie.

`cauce-scribe` escribe en planning lo que el recorrido ya decidió —el WIP, la entrada de `done/`, la compuerta
del hito— y commitea ese estado. Tiene pocas herramientas —archivos, shell y los skills del proyecto— y
**sí carga las instrucciones y las reglas del
proyecto**: lo que redacta sigue lo que la empresa escribió, y eso gana sobre lo que el recorrido dicte.
