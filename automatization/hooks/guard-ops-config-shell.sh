#!/usr/bin/env bash
# Shim: delega `ops-config-shell` en run-hook.sh; el registro de engine/hooks/run.js nombra su módulo.
exec "$(dirname "$0")/run-hook.sh" ops-config-shell
