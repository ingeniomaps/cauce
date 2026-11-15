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

**El sandbox y `.git`.** Con `-s workspace-write`, Codex monta `.git` en sólo lectura, y una tarea no puede cortar
su rama ni commitear: medido con `codex-cli` 0.163.0, `git switch -c` da `Read-only file system`. `install` escribe en
`.codex/config.toml` un bloque entre `# >>> cauce` y `# <<< cauce` con `sandbox_workspace_write.writable_roots`: el
`.git` de cada repositorio, relativo a `.codex/`, que es desde donde Codex lo resuelve. `uninstall` lo saca. Si el
archivo ya tiene su propia tabla `[sandbox_workspace_write]`, no se toca —dos tablas iguales no son TOML válido—, el
bloque de Cauce se saca, e `install` dice la línea que le falta; `doctor` lo vuelve a decir mientras falte. Lo tuyo va
arriba del bloque: una clave escrita debajo cae dentro de esa tabla.

Abrir `.git` deja escribir también `hooks/` y `config`, que corren después fuera del sandbox, cuando commitea la
persona. Eso lo frenan `workspace-boundary` y `shell-boundary` hasta que la persona lo confirma: un hook, un
`git config` que escribe la del repositorio, o un `--template`. Lo que escriba un script por su cuenta no lo ven, ni un
`.git` común con otro nombre.

Los `matcher` filtran el **nombre de la herramienta**: los comandos de shell llegan como `Bash` y las
ediciones como `apply_patch`, `Edit` o `Write`. No son los nombres internos del protocolo.

`UserPromptSubmit` registra el mensaje de la persona, para que lo que pidió en el chat pase sin aprobarlo
a mano. Codex le pasa a cada herramienta el `turn_id` del mensaje que la originó, que es lo que ata la
llamada al pedido.

Si actualizás una instalación anterior a este cambio, `.codex/hooks/hooks.json` queda huérfano —Codex
nunca lo leyó— y se borra a mano.

Los cinco recorridos llegan como skills en `.agents/skills/` —una de las rutas que Codex escanea, junto
con `~/.agents/skills` y `/etc/codex/skills`— y se invocan con `$`: `$onboard`, `$flow`, `$autobuild`,
`$integration-sync` e `$integration-promote`. Ahí va también el catálogo de cargos.

Hasta 0.41.0 el adaptador daba a Codex por incapaz de skills y le dejaba el recorrido sólo como prosa
dentro de `AGENTS.md`, mientras el CLI ya las descubría. Los workflows JS de Claude siguen sin correr
acá: son referencia, no un runtime compatible.

Codex carga las instrucciones de proyecto desde el `AGENTS.md` canónico, por lo que no se instala una
copia adicional. `manifest.json` declara estas capacidades y `node tools/ops.js automation doctor . codex`
valida el wiring.
