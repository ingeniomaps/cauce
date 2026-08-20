#!/usr/bin/env bash
# Impide apagar o borrar la prueba que juzga el cambio.
# Implementación compartida: engine/hooks/run.js → testEvidence().
exec "$(dirname "$0")/run-hook.sh" test-evidence
