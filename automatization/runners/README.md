# Adaptadores de runners

Un adaptador declara:

1. Eventos soportados (`pre-tool`, `post-tool`, `stop`, workflow invocable).
2. Cómo localiza la raíz Ops y ejecuta `engine/cli/ops.js`.
3. Qué fases ejecuta realmente y cuáles quedan como protocolo manual.
4. Cómo instala y desinstala su wiring sin duplicar fuentes de verdad.
5. Qué permisos o acciones externas requieren confirmación.

```text
runners/<nombre>/
├── README.md
├── manifest.json
├── settings.json
├── archivo de instrucciones (si aplica)
└── comandos o artefactos propios (si aplica)
```

Adaptadores incluidos: `claude`, `codex`, `antigravity` y `gemini`. Antigravity es la opción Google
recomendada para cuentas individuales y proyectos nuevos; Gemini se conserva para Enterprise, Google Cloud
y autenticación mediante API keys. Se instalan explícitamente con
`ops automation install`; crear el proyecto no modifica la configuración activa del usuario.
Después de instalar, `ops automation doctor <raíz> <runner>` verifica configuración, instrucciones,
artefactos y disponibilidad del CLI sin requerir autenticación.
