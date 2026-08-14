# Gemini CLI

Adaptador conservado para Gemini Code Assist Enterprise/Standard, Google Cloud y autenticación mediante
API keys. Para cuentas individuales y proyectos Google nuevos usa el runner `antigravity`.

Adaptador mediante configuración de proyecto, `GEMINI.md`, checkpointing y comandos personalizados. Instalar con:

```bash
node tools/ops.js automation install . gemini
```

Instala `.gemini/settings.json`, el contexto raíz `GEMINI.md` y los comandos `/ops:autobuild`,
`/ops:integration-sync` y `/ops:integration-promote`.

Gemini no anuncia hooks nativos en este adaptador: los guards se ejecutan como prechecks indicados por el
protocolo y los comandos. Esta degradación está declarada en `manifest.json`, no se simula protección inexistente.

Comprueba la instalación con `node tools/ops.js automation doctor . gemini`.
