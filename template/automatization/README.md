# Automatización de {{PROJECT_NAME}}

Wiring local entre `planning/PROTOCOL.md` y el runner elegido. El proyecto empieza en modo manual y seguro;
ningún runner se activa solo.

- `config.json`: runner activo y gates requeridos.
- `hooks/`: los guards que se ejecutan. Acá va también el tuyo: agregalo con otro nombre y registralo
  en la configuración de tu runner, que es del proyecto y sobrevive a cada actualización.

Los adaptadores de runner y los workflows no se copian acá: son definiciones que el motor consume y
viajan con Cauce, igual que el catálogo de cargos y los equipos. `automation install` los lee desde ahí.

No copies reglas del protocolo aquí: enlázalas y mecaniza únicamente lo comprobable.

```bash
node tools/ops.js automation check .
node tools/ops.js automation install . claude
```

Hay adaptadores para Claude, Codex, Antigravity y Gemini. Antigravity (`agy`) es la opción Google
recomendada para cuentas individuales y proyectos nuevos; Gemini se conserva para Enterprise, Google
Cloud y API keys. La instalación conserva la configuración existente, y `doctor` comprueba archivos y
disponibilidad del CLI sin autenticarse.

```bash
make install-antigravity
make doctor-antigravity
```

También existen `make install-claude`, `make install-codex` y `make install-gemini`, con sus `doctor-*`.
