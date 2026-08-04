# ChartDB access server 설계

> 상태: 구현 및 검증 완료.

## 배포 구조

- ChartDB 진입점은 `9092` 포트다.
- `chartdb` 컨테이너는 React 정적 파일을 제공하고 `/api/*`를 내부
  `access-server:8788`로 프록시한다.
- `access-server`는 Fastify 단일 프로세스와 Docker 볼륨의 SQLite 파일을
  사용한다.
- `8788` 포트는 호스트에 공개하지 않는다.
- 모든 ERD 읽기와 쓰기는 access-server의 인증·권한 검사를 거친다.
- `/shared/*.json` 직접 공개 경로는 제거한다.
- 최초 배포이므로 기존 JSON 데이터 마이그레이션은 구현하지 않는다.

## 최초 관리자 생성

빈 DB로 처음 시작할 때 다음 비밀 환경변수로 관리자 계정을 한 번만 만든다.

```env
CHARTDB_BOOTSTRAP_ADMIN_USERNAME=admin
CHARTDB_BOOTSTRAP_ADMIN_PASSWORD=<temporary-password>
```

- 계정은 `ADMIN`, `must_change_password=true`로 생성한다.
- 비밀번호 원문은 기록하지 않고 즉시 `scrypt` 해시로 저장한다.
- 사용자가 이미 존재하면 환경변수로 계정이나 비밀번호를 덮어쓰지 않는다.
- DB가 비어 있는데 환경변수가 없으면 서버 시작을 실패시킨다.
- 임시 비밀번호는 저장소에 커밋하지 않고 최초 로그인 완료 후 배포 환경에서
  제거한 뒤 access-server 컨테이너를 재생성한다.

## 관리자 비밀번호 복구

서버 접근 권한이 있는 운영자가 컨테이너 안의 대화형 명령을 실행한다.

```bash
docker compose exec access-server npm run admin:reset-password -- admin
```

명령은 새 비밀번호를 두 번 입력받으며 비밀번호를 명령행 인자, 로그 또는
환경변수에 남기지 않는다. 성공하면 새 비밀번호를 해시해 저장하고
`must_change_password=true`로 바꾸며 해당 관리자의 기존 로그인 세션을 모두
폐기한다. 새 관리자 생성이나 비활성 계정의 자동 활성화는 하지 않는다.

## 사용자와 권한

- `ADMIN`: 전체 사용자·그룹·권한·ERD 관리, 공동 게시자 지정, ERD 보관·복구
- `PUBLISHER`: 새 ERD 생성, 지정된 ERD 게시·수정·과거 버전 복원
- `VIEWER`: 허용된 ERD 열람
- 유효 열람 권한은 `그룹 권한 ∪ 사용자 직접 권한`이다.
- 공동 게시자 지정·해제와 ERD 보관은 관리자만 수행한다.
- 로그인한 사용자만 ChartDB에 진입할 수 있다.

## ERD 버전 관리

- ERD 하나에 여러 게시자를 연결할 수 있다.
- 게시할 때마다 기존 데이터를 덮어쓰지 않고 전체 JSON 스냅샷을 새 버전으로
  저장한다.
- 버전에는 ERD별 순번, 수정 사용자, 사용한 API 토큰(해당 시), 게시 경로,
  선택적 변경 설명과 게시 시각을 기록한다.
- 과거 버전 복원도 과거 기록을 수정하지 않고 새 버전으로 발행한다.
- 초기 범위는 버전 목록, 내용 확인·다운로드, 복원까지다. 시각적 diff 편집기는
  포함하지 않는다.

## 인증

- 관리자가 임시 비밀번호로 계정을 생성하고 최초 로그인 시 변경을 강제한다.
- 웹 로그인은 해시만 DB에 저장하는 불투명 세션과 `HttpOnly`, `SameSite`, 운영
  환경의 `Secure` 쿠키를 사용한다.
- 계정 비활성화와 비밀번호 초기화 시 기존 세션을 폐기한다.
- 게시자는 본인의 API 토큰을 만들고 폐기할 수 있다. 토큰 원문은 생성 시 한
  번만 표시하며 DB에는 해시만 저장한다.
- 웹 세션과 API 토큰은 동일한 게시 권한 검사를 거친다.

## 데이터 모델

핵심 테이블은 `users`, `groups`, `user_groups`, `diagrams`,
`diagram_publishers`, `diagram_versions`, `group_diagram_grants`,
`user_diagram_grants`, `sessions`, `api_tokens`, `schema_migrations`다.
ERD는 이름이 아니라 변경되지 않는 `diagram_id`로 식별하며 같은 표시 이름을
허용한다.

## 프런트엔드와 API

- 로그인·최초 비밀번호 변경 화면과 전체 앱 인증 가드를 추가한다.
- 관리자 화면에서 사용자, 그룹, 구성원, 공동 게시자와 열람 권한을 관리한다.
- ERD 화면에서 버전 이력을 확인하고 복원할 수 있다.
- 브라우저 게시와 CI 게시가 같은 버전 생성 로직을 사용한다.
- 로컬 초안은 사용자 ID별 IndexedDB에 보존한다. 권한이 회수된 서버 ERD의
  캐시는 다음 동기화에서 제거한다.

## 의도적으로 제외한 범위

- OIDC 로그인 구현
- 별도 PostgreSQL 컨테이너
- 마이크로서비스 분리
- 기존 공유 JSON 마이그레이션
- 버전 간 시각적 diff 편집기
- 내장 백업 UI와 스케줄러
