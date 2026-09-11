#!/usr/bin/env bash
# Shim: qué registra está en engine/hooks/run.js → guards['chat']. Sale siempre con 0: el runner lo corre
# sobre el mensaje de la persona, y un 2 ahí no frena una herramienta sino lo que la persona escribió.
"$(dirname "$0")/run-hook.sh" chat >/dev/null 2>&1
exit 0
