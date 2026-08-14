#!/usr/bin/env bash
# Protege reglas, protocolo, automatización y motor ante commits no aprobados.
# Implementación compartida: engine/hooks/run.js → governance().
exec "$(dirname "$0")/run-hook.sh" governance
