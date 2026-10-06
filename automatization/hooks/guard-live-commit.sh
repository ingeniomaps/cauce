#!/usr/bin/env bash
# Shim: delega `live-commit` en run-hook.sh; el registro de engine/hooks/run.js nombra su módulo.
exec "$(dirname "$0")/run-hook.sh" live-commit
