#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-192.168.21.197}"
SSH_PORT="${SSH_PORT:-22}"
BUILD_ROOT="${BUILD_ROOT:-/home/cmtinfo/tmp/chartdb}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/cmtinfo/deploy/chartdb}"
BACKUP_PATH="${BACKUP_PATH:-/home/cmtinfo/backup/chartdb}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

create_release_archive() {
    local output="$1"

    (
        cd "$REPO_ROOT"
        test -f dist/index.html
        tar -czf "$output" \
            dist \
            default.conf.template \
            entrypoint.sh \
            ci/Dockerfile.web \
            ci/docker-compose.deploy.yml \
            ci/deploy-remote.sh \
            publish-server/Dockerfile \
            publish-server/package.json \
            publish-server/package-lock.json \
            publish-server/src \
            publish-server/convert-bundle.mjs \
            publish-server/preserve-layout.mjs
    )
}

quote_for_remote() {
    printf "'%s'" "${1//\'/\'\"\'\"\'}"
}

normalize_safe_root() {
    local path="$1"
    while [[ "$path" != / && "$path" == */ ]]; do
        path="${path%/}"
    done
    [[ "$path" == /* && "$path" != / && "$path" != //* && "$path" != *'//' ]] || return
    [[ "$path/" != *'/./'* && "$path/" != *'/../'* ]] || return
    [[ "$path" =~ ^/[A-Za-z0-9_./-]+$ ]] || return
    printf '%s\n' "$path"
}

main() {
    : "${BUILD_NUMBER:?BUILD_NUMBER is required}"
    : "${SSH_USER:?SSH_USER is required}"
    : "${SSH_PASS:?SSH_PASS is required}"
    [[ "$BUILD_NUMBER" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]] || {
        printf '%s\n' 'BUILD_NUMBER is invalid' >&2
        return 1
    }
    if ! BUILD_ROOT="$(normalize_safe_root "$BUILD_ROOT")"; then
        printf '%s\n' 'BUILD_ROOT is invalid' >&2
        return 1
    fi
    if ! DEPLOY_PATH="$(normalize_safe_root "$DEPLOY_PATH")"; then
        printf '%s\n' 'DEPLOY_PATH is invalid' >&2
        return 1
    fi
    if ! BACKUP_PATH="$(normalize_safe_root "$BACKUP_PATH")"; then
        printf '%s\n' 'BACKUP_PATH is invalid' >&2
        return 1
    fi

    local ARCHIVE TARGET REMOTE_BUILD_PATH remote_command
    ARCHIVE="$(mktemp)"
    trap "rm -f -- $(quote_for_remote "$ARCHIVE")" EXIT
    create_release_archive "$ARCHIVE"

    export SSHPASS="$SSH_PASS"
    local -a SSH_OPTIONS=(-p "$SSH_PORT" -o StrictHostKeyChecking=yes)
    local -a SCP_OPTIONS=(-P "$SSH_PORT" -o StrictHostKeyChecking=yes)
    TARGET="$SSH_USER@$SERVER_HOST"
    REMOTE_BUILD_PATH="$BUILD_ROOT/$BUILD_NUMBER"
    sshpass -e ssh "${SSH_OPTIONS[@]}" "$TARGET" \
        "mkdir -p -- $(quote_for_remote "$REMOTE_BUILD_PATH")"
    sshpass -e scp "${SCP_OPTIONS[@]}" "$ARCHIVE" \
        "$TARGET:$REMOTE_BUILD_PATH/release.tgz"
    sshpass -e scp "${SCP_OPTIONS[@]}" "$SCRIPT_DIR/deploy-remote.sh" \
        "$TARGET:$REMOTE_BUILD_PATH/deploy-remote.sh"

    remote_command="BUILD_NUMBER=$(quote_for_remote "$BUILD_NUMBER") \
BUILD_PATH=$(quote_for_remote "$REMOTE_BUILD_PATH") \
DEPLOY_PATH=$(quote_for_remote "$DEPLOY_PATH") \
BACKUP_PATH=$(quote_for_remote "$BACKUP_PATH") \
bash $(quote_for_remote "$REMOTE_BUILD_PATH/deploy-remote.sh")"
    sshpass -e ssh "${SSH_OPTIONS[@]}" "$TARGET" "$remote_command"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
