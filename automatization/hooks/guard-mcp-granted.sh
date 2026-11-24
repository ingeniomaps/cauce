#!/usr/bin/env bash
# Shim: qué anota el guard está en engine/hooks/run.js → guards['mcp-granted'].
exec "$(dirname "$0")/run-hook.sh" mcp-granted
