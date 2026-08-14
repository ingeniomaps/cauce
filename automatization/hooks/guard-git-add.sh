#!/usr/bin/env bash
# Impide `git add .`, `git add -A` y `git add --all`; exige rutas explícitas.
# Implementación compartida: engine/hooks/run.js → gitAdd().
exec "$(dirname "$0")/run-hook.sh" git-add
