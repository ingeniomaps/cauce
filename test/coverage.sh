#!/usr/bin/env bash
set -euo pipefail

bash test/hooks-smoke.sh
node --test \
  --experimental-test-coverage \
  --test-coverage-include='engine/**/*.js' \
  --test-coverage-include='automatization/**/*.js' \
  --test-coverage-exclude='**/.ops/**' \
  --test-coverage-lines=75 \
  --test-coverage-functions=75 \
  --test-coverage-branches=45 \
  test/*.test.js
