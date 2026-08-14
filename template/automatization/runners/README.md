# Runners

Esta instancia incluye adaptadores instalables para Claude, Codex, Antigravity y Gemini, pero ninguno se
activa automáticamente. Antigravity (`agy`) es la opción Google recomendada para cuentas individuales y
proyectos nuevos. Gemini se conserva para Enterprise, Google Cloud y API keys.

```bash
make install-antigravity
make doctor-antigravity
```

Usa el alias equivalente para otro runner. La instalación conserva configuración existente y `doctor`
comprueba archivos y disponibilidad del CLI sin autenticarse.
