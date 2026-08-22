#!/usr/bin/env bash
# Shim: qué bloquea y cómo lo hace están en engine/hooks/run.js → generated().
exec "$(dirname "$0")/run-hook.sh" generated
