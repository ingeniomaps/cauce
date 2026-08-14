#!/usr/bin/env bash
# Ejecuta los gates del stack y comprueba drift generado antes de un commit.
# Implementación compartida: engine/hooks/run.js → verify().
exec "$(dirname "$0")/run-hook.sh" verify
