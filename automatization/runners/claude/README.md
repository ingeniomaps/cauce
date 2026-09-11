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
