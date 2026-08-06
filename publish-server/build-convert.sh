#!/usr/bin/env bash
# Rebuild convert-bundle.mjs from convert-src.ts (run from repo root after
# changing the ChartDB import lib). Requires the chartdb repo deps installed.
set -euo pipefail
cd "$(dirname "$0")/.."
node_modules/.bin/esbuild publish-server/convert-src.ts \
    --bundle --platform=node --format=esm --target=node20 \
    --alias:@=./src \
    --loader:.png=empty --loader:.jpg=empty --loader:.jpeg=empty \
    --loader:.svg=empty --loader:.gif=empty --loader:.webp=empty \
    --outfile=publish-server/convert-bundle.mjs
echo "built publish-server/convert-bundle.mjs"
