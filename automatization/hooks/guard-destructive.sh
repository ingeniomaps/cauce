#!/usr/bin/env bash
# Bloquea publicación y comandos capaces de destruir datos o el working tree.
# Implementación compartida: engine/hooks/run.js → destructive().
exec "$(dirname "$0")/run-hook.sh" destructive
