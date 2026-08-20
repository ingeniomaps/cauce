# Gemini CLI

Adaptador conservado para Gemini Code Assist Enterprise/Standard, Google Cloud y autenticación mediante
API keys. Para cuentas individuales y proyectos Google nuevos usa el runner `antigravity`.

Adaptador mediante configuración de proyecto, `GEMINI.md`, checkpointing y comandos personalizados. Instalar con:

```bash
node tools/ops.js automation install . gemini
```

Instala `.gemini/settings.json`, el contexto raíz `GEMINI.md` y los comandos `/cauce:onboard`,
`/cauce:team`, `/cauce:autobuild`, `/cauce:integration-sync` y `/cauce:integration-promote`, más el
catálogo de cargos como skills en `.gemini/skills/`.

Antes vivían bajo `/ops:` y eran tres: el arranque y el recorrido de equipo le llegaban sólo como prosa,
así que alguien que venía de otro runner los buscaba en la lista y no estaban. Si actualizás una
instalación vieja, `.gemini/commands/ops/` queda huérfano y se borra a mano.

Gemini CLI tiene hooks nativos y el adaptador los usa: `BeforeTool` y `AfterAgent` en
`.gemini/settings.json`, declarados en `manifest.json`. Sólo corren si la carpeta está marcada como
confiable —`GEMINI.md` explica qué avisa Gemini cuando no lo está—.

Comprueba la instalación con `node tools/ops.js automation doctor . gemini`.
