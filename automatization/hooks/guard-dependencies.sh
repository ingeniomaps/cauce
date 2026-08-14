#!/usr/bin/env bash
# Protege manifests/lockfiles y bloquea publicaciones o instalaciones globales.
# Implementación compartida: engine/hooks/run.js → dependencies().
exec "$(dirname "$0")/run-hook.sh" dependencies
