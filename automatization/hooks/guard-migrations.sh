#!/usr/bin/env bash
# Protege migraciones existentes y bloquea SQL destructivo sin override humano.
# Implementación compartida: engine/hooks/run.js → migrations().
exec "$(dirname "$0")/run-hook.sh" migrations
