#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '[build] frontend dependencies'
HUSKY=0 npm ci
echo '[build] frontend tests'
npm run test:ci
echo '[build] frontend bundle'
npm run build

echo '[build] access-server dependencies and tests'
npm --prefix publish-server ci
npm --prefix publish-server test

test -f dist/index.html
echo '[build] complete: dist/index.html'
