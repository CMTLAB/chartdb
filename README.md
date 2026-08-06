<h1 align="center">
  <a href="https://chartdb.io#gh-light-mode-only">
    <img src="https://github.com/chartdb/chartdb/blob/main/src/assets/logo-light.png" width="400" height="70" alt="ChartDB">
  </a>
  <a href="https://chartdb.io##gh-dark-mode-only">
    <img src="https://github.com/chartdb/chartdb/blob/main/src/assets/logo-dark.png" width="400" height="70" alt="ChartDB">
  </a>
  <br>
</h1>

<p align="center">
  <b>Open-source database diagrams editor</b> <br />
  <b>No installations • No Database password required.</b> <br />
</p>

<h3 align="center">
  <a href="https://discord.gg/QeFwyWSKwC">Community</a>  &bull;
  <a href="https://www.chartdb.io?ref=github_readme">Website</a>  &bull;
  <a href="https://chartdb.io/templates?ref=github_readme">Examples</a>  &bull;
  <a href="https://app.chartdb.io?ref=github_readme">Demo</a>
</h3>

<h4 align="center">
  <a href="https://github.com/chartdb/chartdb?tab=AGPL-3.0-1-ov-file#readme">
    <img src="https://img.shields.io/github/license/chartdb/chartdb?color=blue" alt="ChartDB is released under the AGPL license." />
  </a>
  <a href="https://github.com/chartdb/chartdb/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs welcome!" />
  </a>
  <a href="https://discord.gg/QeFwyWSKwC">
    <img src="https://img.shields.io/discord/1277047413705670678?color=5865F2&label=Discord&logo=discord&logoColor=white" alt="Discord community channel" />
  </a>
  <a href="https://x.com/intent/follow?screen_name=jonathanfishner">
    <img src="https://img.shields.io/twitter/follow/jonathanfishner?style=social"/>
  </a>

</h4>

---

<p align="center">
  <img width='700px' src="./public/chartdb.png">
</p>

### 🎉 ChartDB

ChartDB is a powerful, web-based database diagramming editor.
Instantly visualize your database schema with a single **"Smart Query."** Customize diagrams, export SQL scripts, and access all features—no account required. Experience seamless database design here.

**What it does**:

- **Instant Schema Import**
  Run a single query to instantly retrieve your database schema as JSON. This makes it incredibly fast to visualize your database schema, whether for documentation, team discussions, or simply understanding your data better.

- **AI-Powered Export for Easy Migration**
  Our AI-driven export feature allows you to generate the DDL script in the dialect of your choice. Whether you're migrating from MySQL to PostgreSQL or from SQLite to MariaDB, ChartDB simplifies the process by providing the necessary scripts tailored to your target database.
- **Interactive Editing**
  Fine-tune your database schema using our intuitive editor. Easily make adjustments or annotations to better visualize complex structures.

### Status

ChartDB is currently in Public Beta. Star and watch this repository to get notified of updates.

### Supported Databases

- ✅ PostgreSQL (<img src="./src/assets/postgresql_logo_2.png" width="15"/> + <img src="./src/assets/supabase.png" alt="Supabase" width="15"/> + <img src="./src/assets/timescale.png" alt="Timescale" width="15"/> )
- ✅ MySQL
- ✅ SQL Server
- ✅ MariaDB
- ✅ SQLite (<img src="./src/assets/sqlite_logo_2.png" width="15"/> + <img src="./src/assets/cloudflare_d1.png" alt="Cloudflare D1" width="15"/> Cloudflare D1)
- ✅ CockroachDB
- ✅ ClickHouse

## Getting Started

Use the [cloud version](https://app.chartdb.io?ref=github_readme_2) or deploy locally:

### How To Use

```bash
npm install
npm run dev
```

### Build

```bash
npm install
npm run build
```

### 사내 Docker 배포

최초 실행 전에 임시 관리자 계정을 환경변수로 주입합니다. 비밀번호는 12자
이상이어야 하며 저장소의 `.env` 파일에는 커밋하지 않습니다.

```bash
export CHARTDB_BOOTSTRAP_ADMIN_USERNAME=admin
export CHARTDB_BOOTSTRAP_ADMIN_PASSWORD='<temporary-password>'
docker compose up -d --build
```

ChartDB 진입 주소는 `http://<server>:9092`입니다. 최초 관리자는 로그인 직후
비밀번호를 변경해야 합니다. 계정이 생성된 뒤에는 두 bootstrap 환경변수를
제거하고 access-server를 재생성합니다. 기존 계정이나 비밀번호는 컨테이너
재시작으로 덮어쓰지 않습니다.

HTTP 운영에서는 로그인 비밀번호, 세션 쿠키, API 토큰이 전송 구간에서
암호화되지 않습니다. 접근이 통제된 신뢰 내부망에서만 사용하고, 내부망이
신뢰 경계를 벗어나거나 TLS 종료 프록시를 도입하면 HTTPS 강제와
`CHARTDB_COOKIE_SECURE=true`를 함께 적용합니다.

```bash
unset CHARTDB_BOOTSTRAP_ADMIN_USERNAME CHARTDB_BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --force-recreate access-server
```

HTTPS 프록시 뒤에서 운영할 때는 `CHARTDB_COOKIE_SECURE=true`도 설정합니다.

관리자 비밀번호를 잊은 경우 서버 접근 권한이 있는 운영자가 다음 대화형
명령을 실행합니다. 새 비밀번호는 명령행이나 로그에 표시되지 않으며 기존
로그인 세션은 모두 폐기됩니다.

```bash
docker compose exec access-server npm run admin:reset-password -- admin
```

SQLite 백업은 access-server를 잠시 중지한 상태에서 수행합니다.

```bash
docker compose stop access-server
docker compose cp access-server:/data/chartdb.sqlite ./chartdb.sqlite.backup
docker compose start access-server
```

게시자별 API 토큰을 이용한 Smart Query 자동 게시 경로는 다음과 같습니다.

```bash
curl -X POST 'http://<server>:9092/api/diagrams/<diagram-id>/metadata' \
  -H 'Authorization: Bearer <publisher-api-token>' \
  -H 'Content-Type: application/json' \
  --data-binary @metadata-request.json
```

Or like this if you want to have AI capabilities:

```bash
npm install
VITE_OPENAI_API_KEY=<YOUR_OPEN_AI_KEY> npm run build
```

### Run the Docker Container

```bash
docker run -e OPENAI_API_KEY=<YOUR_OPEN_AI_KEY> -p 8080:80 ghcr.io/chartdb/chartdb:latest
```

#### Build and Run locally

```bash
docker build -t chartdb .
docker run -e OPENAI_API_KEY=<YOUR_OPEN_AI_KEY> -p 8080:80 chartdb
```

#### Using Custom Inference Server

```bash
# Build
docker build \
  --build-arg VITE_OPENAI_API_ENDPOINT=<YOUR_ENDPOINT> \
  --build-arg VITE_LLM_MODEL_NAME=<YOUR_MODEL_NAME> \
  -t chartdb .

# Run
docker run \
  -e OPENAI_API_ENDPOINT=<YOUR_ENDPOINT> \
  -e LLM_MODEL_NAME=<YOUR_MODEL_NAME> \
  -p 8080:80 chartdb
```

> **Privacy Note:** ChartDB includes privacy-focused analytics via Fathom Analytics. You can disable this by adding `-e DISABLE_ANALYTICS=true` to the run command or `--build-arg VITE_DISABLE_ANALYTICS=true` when building.

> **Note:** You must configure either Option 1 (OpenAI API key) OR Option 2 (Custom endpoint and model name) for AI capabilities to work. Do not mix the two options.

Open your browser and navigate to `http://localhost:8080`.

Example configuration for a local vLLM server:

```bash
VITE_OPENAI_API_ENDPOINT=http://localhost:8000/v1
VITE_LLM_MODEL_NAME=Qwen/Qwen2.5-32B-Instruct-AWQ
```

## Try it on our website

1. Go to [ChartDB.io](https://chartdb.io?ref=github_readme_2)
2. Click "Go to app"
3. Choose the database that you are using.
4. Take the magic query and run it in your database.
5. Copy and paste the resulting JSON set into ChartDB.
6. Enjoy Viewing & Editing!

## 💚 Community & Support

- [Discord](https://discord.gg/QeFwyWSKwC) (For live discussion with the community and the ChartDB team)
- [GitHub Issues](https://github.com/chartdb/chartdb/issues) (For any bugs and errors you encounter using ChartDB)
- [Twitter](https://x.com/intent/follow?screen_name=jonathanfishner) (Get news fast)

## Contributing

We welcome community contributions, big or small, and are here to guide you along
the way. Message us in the [ChartDB Community Discord](https://discord.gg/QeFwyWSKwC).

For more information on how to contribute, please see our
[Contributing Guide](/CONTRIBUTING.md).

This project is released with a [Contributor Code of Conduct](/CODE_OF_CONDUCT.md).
By participating in this project, you agree to follow its terms.

Thank you for helping us make ChartDB better for everyone :heart:.

## License

ChartDB is licensed under the [GNU Affero General Public License v3.0](LICENSE)
