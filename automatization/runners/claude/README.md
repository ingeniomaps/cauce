# Claude Code

Adaptador nativo mediante `PreToolUse` y `Stop`. Instalar con:

```bash
node tools/ops.js automation install . claude
```

El instalador fusiona la sección `hooks` en `.claude/settings.json` y conserva otras claves.
También instala `autobuild`, `integration-sync` e `integration-promote` en `.claude/workflows/`. Si ya existe
una versión distinta, se detiene sin sobrescribirla para no destruir personalizaciones del proyecto.
También crea `CLAUDE.md` cuando no existe y conserva uno existente. `manifest.json` declara destinos y
capacidades. Comprueba todo con `node tools/ops.js automation doctor . claude`.
