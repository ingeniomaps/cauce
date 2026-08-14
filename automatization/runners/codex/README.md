# Codex CLI

Codex CLI actual expone hooks nativos y pide confianza al detectar hooks nuevos o modificados. Instalar la
configuración del proyecto con:

```bash
node tools/ops.js automation install . codex
```

El archivo se instala en `.codex/hooks/hooks.json`. La primera sesión revisa y solicita confiar en los hooks;
no se usa `--dangerously-bypass-hook-trust`.

Codex carga las instrucciones de proyecto desde el `AGENTS.md` canónico, por lo que no se instala una copia
adicional. `manifest.json` declara esta capacidad y `node tools/ops.js automation doctor . codex` valida el
wiring. Los workflows JS de Claude no se presentan como compatibles con Codex.
