# Automatización de {{PROJECT_NAME}}

Wiring local entre `planning/PROTOCOL.md` y el runner elegido. El proyecto empieza en modo manual y seguro;
activar un runner requiere completar su adaptador bajo `runners/`.

- `config.json`: runner activo y gates requeridos.
- `hooks/`: implementaciones específicas del runner.
- `workflows/`: recorridos específicos del runner.
- `runners/`: instalación y configuración por herramienta.

No copies reglas del protocolo aquí: enlázalas y mecaniza únicamente lo comprobable.

```bash
node tools/ops.js automation check .
node tools/ops.js automation install . codex
```

También puede usarse `make install-claude`, `make install-codex` o `make install-gemini`.
Valida después con `make doctor-claude`, `make doctor-codex` o `make doctor-gemini`.
