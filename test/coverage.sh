#!/usr/bin/env bash
set -euo pipefail

# Los pisos van unos tres puntos debajo de lo real (91/94/62 al fijarlos): suficiente para que el
# trabajo normal no los toque, y para absorber el ~0.1 que varía entre corridas. Se suben cuando lo
# real se despega, no se bajan cuando algo no llega — quedaron en 45 de ramas mientras lo real rondaba
# 62, y un piso así no protege de nada.
bash test/hooks-smoke.sh
lcov=$(mktemp)
trap 'rm -f "$lcov"' EXIT

node --test \
  --experimental-test-coverage \
  --test-coverage-include='engine/**/*.js' \
  --test-coverage-include='automatization/**/*.js' \
  --test-coverage-exclude='**/.ops/**' \
  --test-coverage-lines=88 \
  --test-coverage-functions=92 \
  --test-coverage-branches=62 \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=lcov --test-reporter-destination="$lcov" \
  test/*.test.js

# El total de arriba no ve el reparto: un módulo al 100% tapa a uno flojo. Éste pide que ninguno baje.
node test/coverage-files.js "$lcov" "${1:-}"
