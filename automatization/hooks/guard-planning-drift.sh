#!/usr/bin/env bash
# Evita cerrar una sesión con planning o integraciones desalineados.
# Implementación compartida: engine/hooks/run.js → planningDrift().
exec "$(dirname "$0")/run-hook.sh" planning-drift
