# Antigravity CLI

Runner Google recomendado para cuentas individuales y proyectos nuevos. Usa el ejecutable `agy` y se
instala como plugin nativo de workspace en `.agents/plugins/cauce/`:

```bash
node tools/ops.js automation install . antigravity
node tools/ops.js automation doctor . antigravity
```

`automation install` deja los archivos y no autentica. **No hace falta registrar nada**: `agy` 1.4.0 descubre el
plugin en el `.agents/` del proyecto, buscando desde la carpeta donde se abre hasta la raíz del proyecto, y lo
carga sólo ahí. Medido el 2026-10-16 (caso 392). Una sesión en otra carpeta no lo ve, y dos proyectos con Cauce
usan cada uno el suyo.

**No lo registres con `agy plugin install`.** Ese comando copia el plugin a `~/.gemini/config/plugins/cauce/`, una
copia por usuario, y `agy` la corre en **toda** carpeta que no tenga plugin propio, con la raíz, las reglas y los
cargos del proyecto que la registró. Hasta 0.108.0 Cauce pedía ese paso, porque un `agy` anterior sólo corría la
copia registrada. Si quedó alguna, `automation doctor` lo dice, y se quita con `agy plugin uninstall cauce`.

El puente encuentra la raíz por la ruta absoluta que `install` deja escrita. El payload de `agy` 1.4.0 trae además la
carpeta de trabajo en `workspacePaths`, y el puente la usa para una sola cosa: si no cae dentro de este proyecto
—una carpeta ajena o una de más arriba—, se abstiene. Un payload sin carpeta, como el de un `agy` viejo, se juzga
como siempre.

`agy plugin validate .agents/plugins/cauce` comprueba el plugin del proyecto.

El plugin aporta hooks `PreToolUse` y `Stop`, reglas Cauce y los cinco recorridos —`/cauce:onboard`,
`/cauce:flow`, `/cauce:autobuild`, `/cauce:integration-sync` y `/cauce:integration-promote`— más el
catálogo de cargos como skills. El bridge convierte el contrato JSON camelCase de Antigravity al motor
compartido de guards y devuelve decisiones nativas `allow`, `deny` o `continue`.

Antigravity también lee el `AGENTS.md` del workspace. El runner `gemini` permanece disponible por
separado para Enterprise, Google Cloud y API keys.
