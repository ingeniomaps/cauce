# Antigravity CLI

Runner Google recomendado para cuentas individuales y proyectos nuevos. Usa el ejecutable `agy` y se
instala como plugin nativo de workspace en `.agents/plugins/cauce/`:

```bash
node tools/ops.js automation install . antigravity
node tools/ops.js automation doctor . antigravity
```

`automation install` deja los archivos y no autentica. El paso que los pone a correr es
`agy plugin install .agents/plugins/cauce`, que el instalador imprime cuando falta. Ese paso **copia el
plugin a `~/.gemini/config/plugins/cauce/` y es esa copia la que `agy` ejecuta**, con un registro por
usuario y no por workspace. De ahí salen tres consecuencias que conviene tener presentes:

- Las rutas del `hooks.json` se resuelven contra la carpeta del plugin, no contra el workspace.
- El payload no nombra el workspace —manda `workspacePaths` vacío y un `Cwd` que apunta al scratch del
  CLI o al home—, así que el puente lleva la raíz ops escrita como ruta absoluta al instalar.
- Registrar desde otro proyecto reemplaza el plugin del anterior.

Volvé a registrar cada vez que `automation install` cambie el wiring o el proyecto se mueva de lugar;
`agy plugin validate .agents/plugins/cauce` comprueba la copia del repo antes de registrarla.

El plugin aporta hooks `PreToolUse` y `Stop`, reglas Cauce y los cinco recorridos —`/cauce:onboard`,
`/cauce:flow`, `/cauce:autobuild`, `/cauce:integration-sync` y `/cauce:integration-promote`— más el
catálogo de cargos como skills. El bridge convierte el contrato JSON camelCase de Antigravity al motor
compartido de guards y devuelve decisiones nativas `allow`, `deny` o `continue`.

Antigravity también lee el `AGENTS.md` del workspace. El runner `gemini` permanece disponible por
separado para Enterprise, Google Cloud y API keys.
