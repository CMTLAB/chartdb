#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node_version=$(<.nvmrc)
if [[ "$(node --version 2>/dev/null || true)" == "$node_version" ]]; then
    exec bash ci/build.sh
fi

agent_platform="$(uname -s)/$(uname -m)"
case "$agent_platform" in
    Linux/x86_64) node_platform=linux-x64 ;;
    Linux/aarch64) node_platform=linux-arm64 ;;
    *)
        printf '[build] Install Node.js %s on Jenkins agent %s\n' "$node_version" "$agent_platform" >&2
        exit 1
        ;;
esac

archive="node-$node_version-$node_platform.tar.gz"
release_url="https://nodejs.org/dist/$node_version"
node_dir=$(mktemp -d)
trap 'rm -rf -- "$node_dir"' EXIT

printf '[build] Downloading Node.js %s for %s\n' "$node_version" "$node_platform"
(
    cd "$node_dir"
    curl -fsS --connect-timeout 15 --retry 2 "$release_url/$archive" -o "$archive"
    curl -fsS --connect-timeout 15 --retry 2 "$release_url/SHASUMS256.txt" -o SHASUMS256.txt
    awk -v archive="$archive" '$2 == archive' SHASUMS256.txt | sha256sum --check --strict
    tar -xzf "$archive"
)

PATH="$node_dir/${archive%.tar.gz}/bin:$PATH" bash ci/build.sh
