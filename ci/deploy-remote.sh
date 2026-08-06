#!/usr/bin/env bash
set -euo pipefail

normalize_app_root() {
    local path="$1"
    while [[ "$path" != / && "$path" == */ ]]; do
        path="${path%/}"
    done
    [[ "$path" == /* && "$path" != //* && "$path" != / ]] || return
    [[ "$path/" != *'/../'* && "$path/" != *'/./'* ]] || return
    printf '%s\n' "$path"
}

backup_data() {
    local source="$1" destination="$2"
    mkdir -p "$destination" || return
    cp -a "$source/." "$destination/" || return
}

restore_data() {
    local source="$1" destination="$2"
    test -d "$source" || return
    mkdir -p "$destination" || return
    find "$destination" -mindepth 1 -depth -delete || return
    cp -a "$source/." "$destination/" || return
}

retain_latest() {
    local parent="$1" keep="$2" protected="${3:-}"
    local -a paths=()
    local path remove_count removed=0
    test -d "$parent" || return 0
    while IFS= read -r path; do
        paths+=("$path")
    done < <(find "$parent" -mindepth 1 -maxdepth 1 -type d -print | sort -V)

    remove_count=$((${#paths[@]} - keep))
    ((remove_count > 0)) || return 0
    for path in "${paths[@]}"; do
        ((removed >= remove_count)) && break
        [[ "${path##*/}" == "$protected" ]] && continue
        rm -rf -- "$path"
        ((removed += 1))
    done
}

compose_release() {
    local tag="$1"
    shift
    RELEASE_TAG="$tag" docker compose \
        --project-directory "$DEPLOY_PATH" \
        -p chartdb \
        -f "$RELEASES_PATH/$tag/ci/docker-compose.deploy.yml" "$@"
}

wait_for_health() {
    local attempt body
    for ((attempt = 1; attempt <= 15; attempt++)); do
        if body="$(curl -fsS http://127.0.0.1:9092/api/health 2>/dev/null)" &&
            grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body"; then
            return 0
        fi
        ((attempt == 15)) || sleep 2
    done
    return 1
}

rollback_deployment() {
    local status=$?
    local data_ready=1
    trap - EXIT
    set +e

    if ((NEW_START_ATTEMPTED)) && ! compose_release "$BUILD_NUMBER" down --remove-orphans; then
        printf '%s\n' 'rollback could not stop the failed release; data was not modified' >&2
        data_ready=0
    fi

    if ((BACKUP_COMPLETE && data_ready)); then
        if [[ -n "$PREVIOUS_RELEASE" ]]; then
            printf '%s\n' "$PREVIOUS_RELEASE" > "$DEPLOY_PATH/current_release"
        else
            rm -f -- "$DEPLOY_PATH/current_release"
        fi
        if ! restore_data "$DEPLOY_BACKUP_PATH" "$DATA_PATH"; then
            printf '%s\n' 'rollback could not restore data; no release was restarted' >&2
            data_ready=0
        fi
    fi

    if [[ -n "$PREVIOUS_RELEASE" ]] && ((PREVIOUS_STOP_ATTEMPTED && data_ready)); then
        cp "$RELEASES_PATH/$PREVIOUS_RELEASE/ci/docker-compose.deploy.yml" \
            "$DEPLOY_PATH/docker-compose.yml"
        if compose_release "$PREVIOUS_RELEASE" up -d && wait_for_health; then
            printf '%s\n' "rollback restored release $PREVIOUS_RELEASE" >&2
        else
            printf '%s\n' "rollback restored data but release $PREVIOUS_RELEASE is unhealthy" >&2
        fi
    elif [[ -z "$PREVIOUS_RELEASE" ]] && ((BACKUP_COMPLETE && data_ready)); then
        printf '%s\n' 'rollback restored pre-deploy data; no previous release to start' >&2
    fi

    exit "$status"
}

main() {
    : "${BUILD_NUMBER:?BUILD_NUMBER is required}"
    : "${BUILD_PATH:?BUILD_PATH is required}"
    : "${DEPLOY_PATH:?DEPLOY_PATH is required}"
    : "${BACKUP_PATH:?BACKUP_PATH is required}"

    DEPLOY_PATH="$(normalize_app_root "$DEPLOY_PATH")" || return
    BACKUP_PATH="$(normalize_app_root "$BACKUP_PATH")" || return
    [[ "$BUILD_NUMBER" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]
    [[ "$BACKUP_PATH/" != "$DEPLOY_PATH/"* ]]
    [[ "$DEPLOY_PATH/" != "$BACKUP_PATH/"* ]]
    DATA_PATH="$DEPLOY_PATH/data"
    RELEASES_PATH="$DEPLOY_PATH/releases"
    RELEASE_PATH="$RELEASES_PATH/$BUILD_NUMBER"
    DEPLOY_BACKUP_PATH="$BACKUP_PATH/$BUILD_NUMBER"
    test "$DATA_PATH" = "$DEPLOY_PATH/data"
    test "$RELEASE_PATH" = "$DEPLOY_PATH/releases/$BUILD_NUMBER"

    test -f "$DEPLOY_PATH/.env"
    test -f "$BUILD_PATH/release.tgz"
    command -v docker >/dev/null
    command -v curl >/dev/null
    docker compose version >/dev/null

    mkdir -p "$DATA_PATH" "$RELEASES_PATH" "$BACKUP_PATH"
    mkdir "$RELEASE_PATH"
    tar -xzf "$BUILD_PATH/release.tgz" -C "$RELEASE_PATH"

    docker build -f "$RELEASE_PATH/ci/Dockerfile.web" \
        -t "chartdb-web:$BUILD_NUMBER" "$RELEASE_PATH"
    docker build -f "$RELEASE_PATH/publish-server/Dockerfile" \
        -t "chartdb-access:$BUILD_NUMBER" "$RELEASE_PATH/publish-server"

    PREVIOUS_RELEASE=''
    if [[ -f "$DEPLOY_PATH/current_release" ]]; then
        local candidate
        IFS= read -r candidate < "$DEPLOY_PATH/current_release" || true
        if [[ "$candidate" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]] &&
            [[ -f "$RELEASES_PATH/$candidate/ci/docker-compose.deploy.yml" ]]; then
            PREVIOUS_RELEASE="$candidate"
        fi
    fi

    PREVIOUS_STOP_ATTEMPTED=0
    BACKUP_COMPLETE=0
    NEW_START_ATTEMPTED=0
    trap rollback_deployment EXIT

    if [[ -n "$PREVIOUS_RELEASE" ]]; then
        PREVIOUS_STOP_ATTEMPTED=1
        compose_release "$PREVIOUS_RELEASE" down --remove-orphans
    fi
    backup_data "$DATA_PATH" "$DEPLOY_BACKUP_PATH"
    BACKUP_COMPLETE=1

    NEW_START_ATTEMPTED=1
    compose_release "$BUILD_NUMBER" up -d
    wait_for_health

    printf '%s\n' "$BUILD_NUMBER" > "$DEPLOY_PATH/current_release"
    cp "$RELEASE_PATH/ci/docker-compose.deploy.yml" "$DEPLOY_PATH/docker-compose.yml"
    trap - EXIT

    local -a release_paths=()
    local path tag
    while IFS= read -r path; do
        release_paths+=("$path")
    done < <(find "$RELEASES_PATH" -mindepth 1 -maxdepth 1 -type d -print)

    retain_latest "$RELEASES_PATH" 5 "$BUILD_NUMBER"
    retain_latest "$BACKUP_PATH" 5 "$BUILD_NUMBER"
    for path in "${release_paths[@]}"; do
        if [[ ! -d "$path" ]]; then
            tag="${path##*/}"
            docker image rm "chartdb-web:$tag" "chartdb-access:$tag" >/dev/null 2>&1 || true
        fi
    done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
