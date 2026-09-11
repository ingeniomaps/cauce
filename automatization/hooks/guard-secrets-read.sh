#!/usr/bin/env bash
# Shim: qué bloquea el guard está en engine/hooks/run.js → guards['secrets-read'].
exec "$(dirname "$0")/run-hook.sh" secrets-read
