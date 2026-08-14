#!/usr/bin/env bash
# Bloquea escritura de secretos, claves privadas y credenciales en texto plano.
# Implementación compartida: engine/hooks/run.js → secrets().
exec "$(dirname "$0")/run-hook.sh" secrets
