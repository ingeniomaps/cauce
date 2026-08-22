#!/usr/bin/env bash
# Shim: qué bloquea y cómo lo hace están en engine/hooks/run.js → gitAdd().
exec "$(dirname "$0")/run-hook.sh" git-add
