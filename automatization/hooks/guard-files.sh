#!/usr/bin/env bash
# Corre en un solo proceso los guards de archivos: secrets, generated, workspace-boundary,
# migrations, integration-snapshot. Implementación compartida: engine/hooks/run.js → hookGroups['pre-files'].
exec "$(dirname "$0")/run-hook.sh" pre-files
