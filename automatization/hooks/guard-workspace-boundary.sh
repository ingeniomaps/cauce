#!/usr/bin/env bash
# Limita escrituras a las raíces declaradas en ops.config.json.
# Implementación compartida: engine/hooks/run.js → workspaceBoundary().
exec "$(dirname "$0")/run-hook.sh" workspace-boundary
