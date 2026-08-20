# Antigravity CLI

Runner Google recomendado para cuentas individuales y proyectos nuevos. Usa el ejecutable `agy` y se
instala como plugin nativo de workspace en `.agents/plugins/cauce/`:

```bash
node tools/ops.js automation install . antigravity
node tools/ops.js automation doctor . antigravity
```

`automation install` deja los archivos y no autentica. El paso que los pone a correr es
`agy plugin install .agents/plugins/cauce`, que el instalador imprime cuando falta y que sí escribe
fuera del proyecto: `agy plugin list` lleva un registro por usuario, no por workspace. Registrá parado
en el proyecto en el que vas a trabajar, y verificá con `agy plugin validate .agents/plugins/cauce` que
lo válido sea la copia de este repo.

El plugin aporta hooks `PreToolUse` y `Stop`, reglas Cauce y los cinco recorridos —`/cauce:onboard`,
`/cauce:team`, `/cauce:autobuild`, `/cauce:integration-sync` y `/cauce:integration-promote`— más el
catálogo de cargos como skills. El bridge convierte el contrato JSON camelCase de Antigravity al motor
compartido de guards y devuelve decisiones nativas `allow`, `deny` o `continue`.

Antigravity también lee el `AGENTS.md` del workspace. El runner `gemini` permanece disponible por
separado para Enterprise, Google Cloud y API keys.
