#!/usr/bin/env bash
# Shim: qué bloquea el guard está en engine/hooks/run.js → guards['test-workers'].
exec "$(dirname "$0")/run-hook.sh" test-workers
