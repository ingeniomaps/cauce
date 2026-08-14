#!/usr/bin/env bash
# Corre en un solo proceso los guards de shell: destructive, git-add, dependencies, governance, verify.
# Implementación compartida: engine/hooks/run.js → hookGroups['pre-shell'].
exec "$(dirname "$0")/run-hook.sh" pre-shell
