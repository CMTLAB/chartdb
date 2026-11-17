#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

expected_node_version=$(<.nvmrc)
actual_node_version=$(node --version)
if [[ "$actual_node_version" != "$expected_node_version" ]]; then
    printf '[build] Node.js %s is required (.nvmrc), found %s\n' \
        "$expected_node_version" "$actual_node_version" >&2
    exit 1
fi

export CI=true
export NO_COLOR=1

run_step() {
    local label="$1"
    local started=$SECONDS
    local status
    local state
    shift
    echo "[build] START ${label}"
    if "$@"; then
        status=0
        state='DONE'
    else
        status=$?
        state='FAIL'
    fi
    echo "[build] ${state} ${label} ($((SECONDS - started))s)"
    return "$status"
}

build_started=$SECONDS

run_step 'build logging check' bash ci/build.test.sh
run_step 'frontend dependencies' env HUSKY=0 npm ci --no-audit --no-fund --loglevel=error
run_step 'frontend tests' npm run test:ci
run_step 'frontend lint' npm run lint
run_step 'frontend typecheck' npm run typecheck
run_step 'frontend bundle' env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" \
    npm run build:bundle -- --logLevel warn
run_step 'frontend bundle check' node ci/check-bundle.mjs

run_step 'access-server dependencies' npm --prefix publish-server ci --no-audit --no-fund --loglevel=error
run_step 'access-server tests' bash -o pipefail -c 'npm --prefix publish-server test | sed "/^✔ /d"'

test -f dist/index.html
echo "[build] COMPLETE dist/index.html ($((SECONDS - build_started))s total)"
