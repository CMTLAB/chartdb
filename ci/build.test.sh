#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

set +e
output=$(bash -c '
    set -euo pipefail
    eval "$(sed -n "/^run_step()/,/^}/p" "$1")"
    run_step failure-check bash -c "echo expected-error >&2; exit 7"
' _ "$PWD/ci/build.sh" 2>&1)
status=$?
set -e

test "$status" -eq 7
[[ "$output" == *expected-error* ]]
[[ "$output" =~ \[build\]\ FAIL\ failure-check\ \([0-9]+s\) ]]
