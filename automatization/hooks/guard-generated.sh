#!/usr/bin/env bash
# Impide editar manualmente archivos reconocidos como código generado.
# Implementación compartida: engine/hooks/run.js → generated().
exec "$(dirname "$0")/run-hook.sh" generated
