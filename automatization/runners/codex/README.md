# Codex CLI

Codex CLI expone hooks nativos. Instalar la configuración del proyecto con:

```bash
node tools/ops.js automation install . codex
```

El archivo se instala en `.codex/hooks.json`. Es una de las cuatro ubicaciones que Codex lee —las otras
son `.codex/config.toml` y las dos equivalentes bajo `~/.codex/`—; la forma `hooks/hooks.json` es la que
usa un plugin y no la que lee un repositorio.

**Instalar no alcanza.** Un hook no gestionado queda registrado pero **no corre** hasta que se lo confía:
Codex guarda la confianza contra el hash del archivo y saltea en silencio lo nuevo o lo modificado. Abrí
una sesión y usá `/hooks` para revisarlos y confiarlos; hay que repetirlo cada vez que el wiring cambie,
porque cambia el hash. No se usa `--dangerously-bypass-hook-trust`.

Los `matcher` filtran el **nombre de la herramienta**: los comandos de shell llegan como `Bash` y las
ediciones como `apply_patch`, `Edit` o `Write`. No son los nombres internos del protocolo.

Si actualizás una instalación anterior a este cambio, `.codex/hooks/hooks.json` queda huérfano —Codex
nunca lo leyó— y se borra a mano.

Los cinco recorridos llegan como skills en `.agents/skills/` —una de las rutas que Codex escanea, junto
con `~/.agents/skills` y `/etc/codex/skills`— y se invocan con `$`: `$onboard`, `$team`, `$autobuild`,
`$integration-sync` e `$integration-promote`. Ahí va también el catálogo de cargos.

Hasta 0.41.0 el adaptador daba a Codex por incapaz de skills y le dejaba el recorrido sólo como prosa
dentro de `AGENTS.md`, mientras el CLI ya las descubría. Los workflows JS de Claude siguen sin correr
acá: son referencia, no un runtime compatible.

Codex carga las instrucciones de proyecto desde el `AGENTS.md` canónico, por lo que no se instala una
copia adicional. `manifest.json` declara estas capacidades y `node tools/ops.js automation doctor . codex`
valida el wiring.
