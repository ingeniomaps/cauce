#!/usr/bin/env bash
# Shim: qué bloquea y cómo lo hace están en engine/hooks/run.js → workspaceBoundary().
exec "$(dirname "$0")/run-hook.sh" workspace-boundary
