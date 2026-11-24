#!/usr/bin/env bash
# Shim del grupo de las herramientas MCP: la lista y el orden de sus guards están en
# engine/hooks/run.js → hookGroups['pre-mcp'].
exec "$(dirname "$0")/run-hook.sh" pre-mcp
