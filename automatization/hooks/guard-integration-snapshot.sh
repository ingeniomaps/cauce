#!/usr/bin/env bash
# Impide editar snapshots que pertenecen a los sincronizadores de integraciones.
# Implementación compartida: engine/hooks/run.js → integrationSnapshot().
exec "$(dirname "$0")/run-hook.sh" integration-snapshot
