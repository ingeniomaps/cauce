#!/usr/bin/env bash
# Shim: delega `rules-notice` en run-hook.sh; qué avisa está en engine/hooks/rules-notice.js. Sale siempre con
# 0, como guard-chat.sh y por lo mismo: corre sobre el mensaje de la persona. Lo que imprime sí pasa, porque
# es lo que el runner le agrega a la sesión.
CAUCE_NOTICE_RUNNER="${1:-claude}" "$(dirname "$0")/run-hook.sh" rules-notice 2>/dev/null
exit 0
