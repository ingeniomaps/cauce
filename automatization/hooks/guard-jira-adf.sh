#!/usr/bin/env bash
# Shim: qué bloquea el guard está en engine/hooks/run.js → guards['jira-adf'].
exec "$(dirname "$0")/run-hook.sh" jira-adf
