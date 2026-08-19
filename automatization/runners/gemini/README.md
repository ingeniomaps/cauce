# Gemini CLI

Adaptador conservado para Gemini Code Assist Enterprise/Standard, Google Cloud y autenticación mediante
API keys. Para cuentas individuales y proyectos Google nuevos usa el runner `antigravity`.

Adaptador mediante configuración de proyecto, `GEMINI.md`, checkpointing y comandos personalizados. Instalar con:

```bash
node tools/ops.js automation install . gemini
```

Instala `.gemini/settings.json`, el contexto raíz `GEMINI.md` y los comandos `/cauce:onboard`,
`/cauce:team`, `/cauce:autobuild`, `/cauce:integration-sync` y `/cauce:integration-promote`.

Antes vivían bajo `/ops:` y eran tres: el arranque y el recorrido de equipo le llegaban sólo como prosa,
así que alguien que venía de otro runner los buscaba en la lista y no estaban. Si actualizás una
instalación vieja, `.gemini/commands/ops/` queda huérfano y se borra a mano.

Gemini no anuncia hooks nativos en este adaptador: los guards se ejecutan como prechecks indicados por el
protocolo y los comandos. Esta degradación está declarada en `manifest.json`, no se simula protección inexistente.

Comprueba la instalación con `node tools/ops.js automation doctor . gemini`.
