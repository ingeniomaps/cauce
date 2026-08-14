# Antigravity CLI

Runner Google recomendado para cuentas individuales y proyectos nuevos. Usa el ejecutable `agy` y se instala
como plugin nativo de workspace en `.agents/plugins/cauce/`:

```bash
make install-antigravity
make doctor-antigravity
```

El plugin aporta hooks `PreToolUse` y `Stop`, reglas Cauce y skills `/autobuild`,
`/integration-sync` y `/integration-promote`. El bridge convierte el contrato JSON camelCase de Antigravity
al motor compartido de guards y devuelve decisiones nativas `allow`, `deny` o `continue`.

La instalación no autentica ni modifica preferencias globales. Antigravity también lee el `AGENTS.md` del
workspace. El runner `gemini` permanece disponible por separado para Enterprise, Google Cloud y API keys.
