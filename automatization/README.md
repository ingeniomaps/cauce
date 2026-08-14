# Automatización — wiring de runners

Las reglas para modificar esta capa están en [`AGENTS.md`](AGENTS.md).

Este directorio conecta el protocolo agnóstico con runners concretos. No contiene estado del proyecto ni
reglas de negocio.

| Directorio | Responsabilidad |
|---|---|
| `workflows/` | Recorridos ejecutables o especificaciones de ejecución. |
| `hooks/` | Gates mecánicos antes/después de herramientas y al cerrar una sesión. |
| `runners/` | Adaptadores de Claude, Codex, Gemini u otros entornos. |

El dueño del proceso sigue siendo `template/planning/PROTOCOL.md`. Un workflow implementa ese contrato; no
lo redefine. El motor determinista vive en `engine/`.

La base inicial es neutral y manual: documenta los puntos de extensión sin fingir hooks universales. Cada
runner debe declarar capacidades, rutas de instalación y degradación cuando una capacidad no exista.

## Activación

```bash
node engine/cli/ops.js automation check .
node engine/cli/ops.js automation list-hooks .
node engine/cli/ops.js automation install . codex
```

Los hooks se instalan por proyecto y el runner puede exigir confianza o reinicio de sesión.
