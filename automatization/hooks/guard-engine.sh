#!/usr/bin/env bash
# Impide editar el motor instalado por npm. Inerte en el propio toolkit.
# Implementación compartida: engine/hooks/run.js → engineWrites().
exec "$(dirname "$0")/run-hook.sh" engine
