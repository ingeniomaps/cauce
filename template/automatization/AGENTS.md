# automatization/ — reglas del wiring de agentes

Este archivo gobierna cualquier cambio dentro de `automatization/`. La constitución general del proyecto
está en `../AGENTS.md`; la especificación del proceso está en `../planning/PROTOCOL.md`. Este directorio
implementa y conecta ese proceso con runners concretos: no redefine producto, prioridades ni estado.

## Mapa y fuentes de verdad

| Ruta | Responsabilidad |
|---|---|
| `hooks/` | Entradas estables; la lógica vive en `.ops/engine/hooks/run.js`. |
| `workflows/` | Recorridos portables; las fases pertenecen a `planning/PROTOCOL.md`. |
| `runners/` | Adaptadores que declaran su contrato en `manifest.json`. |

Los archivos instalados bajo `.claude/`, `.codex/`, `.gemini/` o `.agents/` son destinos materializados.
Nunca se convierten en una segunda fuente de verdad: se cambia primero `automatization/` y se reinstala con
`ops automation install` o el alias de `make` correspondiente.

## Invariantes de cambio

- Mantén el proceso agnóstico al runner. Si una fase cambia, actualiza `planning/PROTOCOL.md` y su workflow
  en el mismo cambio; un adaptador solo traduce eventos, rutas y formatos.
- Mantén los guards deterministas y sin red. Un wrapper `guard-*.sh` solo delega al motor compartido; no
  copies lógica de seguridad entre runners.
- Declara capacidades reales. No anuncies hooks, workflows, instrucciones o checkpointing que la herramienta
  no ejecute de forma nativa; documenta cualquier degradación.
- Conserva configuraciones existentes al instalar. No sobrescribas archivos divergentes ni preferencias,
  permisos, secretos o autenticación del usuario.
- Las integraciones son generales. Los workflows reciben `provider`; Jira es un adaptador, no una dependencia
  del núcleo ni del workflow base.
- Toda acción remota, publicación, deploy, escritura en un proveedor o uso de credenciales sigue necesitando
  la autorización definida en `../AGENTS.md`.

## Contrato de un runner

Cada `runners/<nombre>/` debe incluir `README.md` y `manifest.json`, declarar el ejecutable usado, configuración,
instrucciones, artefactos y capacidades, y proporcionar archivos fuente válidos para todos sus destinos.

Al añadir o cambiar un runner:

1. Usa las rutas y el protocolo vigentes documentados oficialmente por la herramienta.
2. Traduce su entrada y salida al motor compartido cuando sus eventos tengan otro schema.
3. Añádelo al registro del CLI, a los aliases de instalación/doctor y a la documentación general.
4. Prueba una operación permitida y al menos un bloqueo real; no basta validar que el JSON parsea.

Antigravity (`agy`) es el runner Google recomendado para cuentas individuales y proyectos nuevos. Gemini CLI
se mantiene como adaptador separado para Enterprise, Google Cloud y API keys mientras continúe soportado. No
mezcles sus rutas: Antigravity usa personalizaciones de workspace en `.agents/`; Gemini usa `.gemini/`.

## Verificación obligatoria

Antes de cerrar un cambio en este directorio ejecuta:

```bash
node tools/ops.js automation check .       # instancia generada
node engine/cli/ops.js automation check .  # desarrollo del toolkit
```

En el toolkit ejecuta además `node --test test/hooks.test.js test/runners.test.js test/workflows.test.js`. Si
cambia instalación o materialización, valida `ops init` en un directorio temporal, instala el runner y ejecuta
`automation doctor`. No autentiques una cuenta ni llames servicios externos para probar el wiring.

## Límites

No edites `planning/BACKLOG.md`, `WIP.md` o `DONE.md` desde hooks o instaladores. No hagas que `ops init` active
un runner silenciosamente. No agregues lógica de negocio, nombres de servicios de un proyecto, tokens, rutas
personales ni modelos concretos a esta capa reusable.
