#!/usr/bin/env bash
# Shim: qué guards corre el grupo y qué bloquea cada uno están en
# engine/hooks/run.js → hookGroups['pre-shell'].
exec "$(dirname "$0")/run-hook.sh" pre-shell
