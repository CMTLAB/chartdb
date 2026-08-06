# ChartDB Jenkins 배포

## 1. Jenkins Job 설정

다음 설정으로 Pipeline Job을 생성합니다.

- 정의: `Pipeline script from SCM`
- SCM: ChartDB Git 저장소
- 브랜치 지정자: `*/main`
- 스크립트 경로: `ci/Jenkinsfile`

Pipeline은 약 3분마다 SCM을 확인하고, 빌드를 한 번에 하나만 실행하며, 20분이
지나면 타임아웃됩니다.

저장소 스크립트를 사용하는 Teams 알림은 workspace checkout이 성공한 뒤부터
동작합니다. checkout 자체가 실패하면 `ci/notify-teams.sh`를 사용할 수 없으므로
Pipeline이 명시적인 건너뜀 메시지를 출력합니다. checkout 실패는 Jenkins 빌드
상태와 콘솔에서 계속 확인할 수 있습니다.

## 2. Jenkins Credentials

다음 Credentials를 표시된 ID 그대로 생성합니다.

- `server-password`: Username with password. 서버 계정 `cmtinfo`와 해당 SSH
  비밀번호를 사용합니다.
- `teams-deploy-webhook-url`: Teams Workflows webhook URL을 담은 Secret text.
- SCM Git Credential: 비공개 저장소일 때만 필요하며 Job의 SCM 설정에서
  선택합니다.

서버 `.env` 값은 Jenkins Credentials나 소스 관리에 넣지 않습니다.

## 3. Jenkins Agent 사전 준비

Node.js 24, npm, Git, `ssh`, `scp`, `sshpass`를 설치합니다. 검증된 서버 호스트
키를 Jenkins 서비스 계정에 등록하며 호스트 키 검사를 비활성화하지 않습니다.

```bash
install -d -m 700 ~/.ssh
ssh-keyscan -H 192.168.21.197 > /tmp/chartdb-host-key
# 이 지문을 서버 관리자가 신뢰하는 지문과 비교합니다.
ssh-keygen -lf /tmp/chartdb-host-key
cat /tmp/chartdb-host-key >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
```

`~/.ssh`가 Jenkins 서비스 계정의 홈을 가리키도록 해당 계정으로 명령을
실행합니다. 지문을 별도 경로로 검증한 뒤에만 키를 추가합니다.

## 4. 서버 사전 준비

서버에는 Docker Engine, Docker Compose plugin, `curl`, `tar`가 필요합니다.
`cmtinfo` 계정은 `sudo` 없이 Docker를 실행할 수 있어야 하고, Jenkins Agent의
SSH 접속을 허용해야 하며, 배포 경로를 소유해야 합니다. Jenkins와 클라이언트의
TCP 9092 접근은 의도한 내부망에서만 허용합니다.

다음 명령으로 확인합니다.

```bash
docker version
docker compose version
curl --version
tar --version
id cmtinfo
```

필요하면 Docker 접근 권한을 한 번 추가한 뒤 새 로그인 세션을 시작합니다.

```bash
sudo usermod -aG docker cmtinfo
```

## 5. 서버 디렉터리

`192.168.21.197`에서 한 번 실행합니다.

```bash
sudo install -d -m 750 -o cmtinfo -g cmtinfo \
  /home/cmtinfo/deploy/chartdb \
  /home/cmtinfo/backup/chartdb \
  /home/cmtinfo/tmp/chartdb
```

각 경로는 순서대로 운영 배포/data 디렉터리, 자동 DB 백업, 빌드별 스테이징
영역입니다.

## 6. 서버 환경 설정

최초 빌드 전에 서버에 `/home/cmtinfo/deploy/chartdb/.env`를 생성합니다.

```bash
umask 077
cat > /home/cmtinfo/deploy/chartdb/.env <<'ENV'
CHARTDB_COOKIE_SECURE=false
CHARTDB_BOOTSTRAP_ADMIN_USERNAME=admin
CHARTDB_BOOTSTRAP_ADMIN_PASSWORD=replace-this-before-first-deploy
HIDE_CHARTDB_CLOUD=true
DISABLE_ANALYTICS=true
OPENAI_API_KEY=
OPENAI_API_ENDPOINT=
LLM_MODEL_NAME=
ENV
chmod 600 /home/cmtinfo/deploy/chartdb/.env
```

`replace-this-before-first-deploy`는 예시이며 **실제 비밀번호로 사용할 수
없습니다**. Jenkins를 실행하기 전에 12자 이상의 고유한 임시 비밀번호로
바꿉니다. 이 배포는 일반 HTTP를 사용하므로 `CHARTDB_COOKIE_SECURE=false`가
필요합니다. 신뢰할 수 있는 내부망에만 노출하고, HTTPS 종료 지점을 추가하면
`true`로 설정합니다.

## 7. 최초 배포 및 bootstrap 정리

`.env`를 만든 뒤 Jenkins에서 **Build Now**를 실행합니다.
`http://192.168.21.197:9092`를 열고 임시 비밀번호로 `admin`에 로그인한 다음,
강제 비밀번호 변경을 완료합니다. 새 비밀번호는 12자 이상이어야 합니다.
비밀번호를 변경하면 기존 세션이 로그아웃되므로 다시 로그인합니다.

그다음 `.env`에서 bootstrap 비밀번호를 제거하고 access-server 컨테이너만 다시
생성하여 환경에 비밀값이 남지 않게 합니다.

```bash
DEPLOY_PATH=/home/cmtinfo/deploy/chartdb
RELEASE_TAG="$(cat "$DEPLOY_PATH/current_release")"
COMPOSE_FILE="$DEPLOY_PATH/releases/$RELEASE_TAG/ci/docker-compose.deploy.yml"
sed -i '/^CHARTDB_BOOTSTRAP_ADMIN_PASSWORD=/d' "$DEPLOY_PATH/.env"
RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" \
  up -d --force-recreate access-server
```

Bootstrap 값은 빈 데이터베이스에 최초 관리자만 생성하며 기존 계정을 덮어쓰지
않습니다.

## 8. 상태 및 로그 확인

모든 운영 Compose 명령은 현재 릴리스 파일과 배포 루트를 project directory로
사용해야 합니다.

```bash
DEPLOY_PATH=/home/cmtinfo/deploy/chartdb
RELEASE_TAG="$(cat "$DEPLOY_PATH/current_release")"
COMPOSE_FILE="$DEPLOY_PATH/releases/$RELEASE_TAG/ci/docker-compose.deploy.yml"

RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" ps
RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" \
  logs --tail=200 access-server chartdb
curl -fsS http://127.0.0.1:9092/api/health
```

## 9. 롤백

### 이미지만 롤백(현재 DB 유지)

현재 데이터베이스 내용을 유지하면서 애플리케이션 이미지만 되돌릴 때 사용합니다.
기존 릴리스 태그를 선택해야 하며, 해당 릴리스의 DB 백업은 **복원하지
않습니다**.

```bash
(
set -euo pipefail
DEPLOY_PATH=/home/cmtinfo/deploy/chartdb
ROLLBACK_RELEASE=replace-with-release-tag
[[ "$DEPLOY_PATH" == /home/cmtinfo/deploy/chartdb ]]
[[ "$ROLLBACK_RELEASE" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]
COMPOSE_FILE="$DEPLOY_PATH/releases/$ROLLBACK_RELEASE/ci/docker-compose.deploy.yml"
test -f "$COMPOSE_FILE"

RELEASE_TAG="$ROLLBACK_RELEASE" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" up -d
curl -fsS http://127.0.0.1:9092/api/health
cp "$COMPOSE_FILE" "$DEPLOY_PATH/docker-compose.yml"
printf '%s\n' "$ROLLBACK_RELEASE" > "$DEPLOY_PATH/current_release"
)
```

### 파괴적 DB 복원(새 데이터 손실)

**경고:** 이 절차는 운영 data 디렉터리 전체를 교체합니다. 선택한 백업보다
새로운 모든 다이어그램, 사용자, 토큰, 감사 변경 사항이 사라집니다. SQLite
파일을 복사하기 전에 스택을 중지합니다. 백업 디렉터리 `<build>`에는 해당
빌드를 배포하기 직전의 데이터가 들어 있습니다.

```bash
(
set -euo pipefail
DEPLOY_PATH=/home/cmtinfo/deploy/chartdb
BACKUP_PATH=/home/cmtinfo/backup/chartdb
BACKUP_BUILD=replace-with-backup-directory
[[ "$DEPLOY_PATH" == /home/cmtinfo/deploy/chartdb ]]
[[ "$BACKUP_PATH" == /home/cmtinfo/backup/chartdb ]]
[[ "$BACKUP_BUILD" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]

DATA_PATH="$DEPLOY_PATH/data"
[[ "$DATA_PATH" == /home/cmtinfo/deploy/chartdb/data ]]
RELEASE_TAG="$(cat "$DEPLOY_PATH/current_release")"
[[ "$RELEASE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]
COMPOSE_FILE="$DEPLOY_PATH/releases/$RELEASE_TAG/ci/docker-compose.deploy.yml"
test -f "$COMPOSE_FILE"
test -d "$BACKUP_PATH/$BACKUP_BUILD"
test -f "$DATA_PATH/chartdb.sqlite"

RESTORE_STAGE="$(mktemp -d)"
trap 'rm -rf -- "$RESTORE_STAGE"' EXIT
tar -czf "$RESTORE_STAGE/selected-backup.tgz" \
  -C "$BACKUP_PATH/$BACKUP_BUILD" .
tar -tzf "$RESTORE_STAGE/selected-backup.tgz" >/dev/null
mkdir "$RESTORE_STAGE/data"
tar -xzf "$RESTORE_STAGE/selected-backup.tgz" -C "$RESTORE_STAGE/data"
test -f "$RESTORE_STAGE/data/chartdb.sqlite"
test ! -L "$RESTORE_STAGE/data/chartdb.sqlite"

RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" \
  down --remove-orphans
SAFETY_ARCHIVE="$(mktemp "$BACKUP_PATH/manual-before-restore.XXXXXX")"
tar -czf "$SAFETY_ARCHIVE" -C "$DATA_PATH" .
tar -tzf "$SAFETY_ARCHIVE" >/dev/null
find "$DATA_PATH" -mindepth 1 -depth -delete
cp -a "$RESTORE_STAGE/data/." "$DATA_PATH/"
test -f "$DATA_PATH/chartdb.sqlite"
RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" up -d
curl -fsS http://127.0.0.1:9092/api/health
)
```

## 10. 관리자 비밀번호 재설정

기존 재설정 도구는 비밀번호를 명령행이나 로그에 남기지 않고 두 번
입력받습니다. 또한 계정이 다시 강제로 비밀번호를 변경하도록 표시하고 기존
세션을 무효화합니다.

```bash
DEPLOY_PATH=/home/cmtinfo/deploy/chartdb
RELEASE_TAG="$(cat "$DEPLOY_PATH/current_release")"
COMPOSE_FILE="$DEPLOY_PATH/releases/$RELEASE_TAG/ci/docker-compose.deploy.yml"
RELEASE_TAG="$RELEASE_TAG" docker compose \
  --project-directory "$DEPLOY_PATH" -p chartdb -f "$COMPOSE_FILE" \
  exec -e DATABASE_FILE=/data/chartdb.sqlite access-server \
  npm run admin:reset-password -- admin
```

새 비밀번호는 12자 이상이어야 합니다.

## 11. 외부 레지스트리 장애 대응

서버는 `node:24-alpine`과 `nginx:stable-alpine`을 기반으로 이미지를 빌드합니다.
공개 레지스트리에 접근할 수 없다면, 접근이 허용된 머신에서 정확히 이 두
태그를 미리 준비합니다.

```bash
docker pull node:24-alpine
docker pull nginx:stable-alpine
docker save node:24-alpine nginx:stable-alpine | gzip > chartdb-base-images.tar.gz
```

승인된 경로로 아카이브를 전송한 뒤 서버에서 실행합니다.

```bash
gzip -dc chartdb-base-images.tar.gz | docker load
```

이 base image만 미리 준비해서는 충분하지 않습니다. publish-server 이미지는
`npm ci`를, web 이미지는 `apk add`를 실행합니다. 따라서 서버에는 npm
레지스트리와 Alpine package repository에 대한 승인된 접근, 미러 또는 캐시도
필요합니다. 승인되지 않은 미러 URL로 대체하지 않습니다.

또는 외부 접근이 승인된 빌더에서 파생 이미지인 `chartdb-web:<tag>`와
`chartdb-access:<tag>`를 빌드하고 승인된 경로로 전송합니다. 현재 원격
스크립트는 서버에서 이미지를 빌드하므로, 오프라인 배포에서는 재빌드 대신
전송된 파생 이미지를 불러와 사용하도록 배포 절차도 변경해야 합니다. 조직의
이미지 미러 정책에 따라 승인된 내부 레지스트리를 base 또는 파생 이미지에
사용할 수 있습니다.
