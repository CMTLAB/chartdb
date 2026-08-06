#!/usr/bin/env bash
set -euo pipefail

: "${TEAMS_WEBHOOK_URL:?TEAMS_WEBHOOK_URL is required}"
: "${TEAMS_STATUS:?TEAMS_STATUS is required}"

node <<'NODE'
const statusLabels = {
  SUCCESS: ['성공', 'Good'],
  FAILURE: ['실패', 'Attention'],
  ABORTED: ['중단', 'Warning'],
  UNSTABLE: ['불안정', 'Warning'],
};

const value = (name) => process.env[name] || '';
const status = value('TEAMS_STATUS');
const [statusLabel, statusColor] = statusLabels[status] ?? [status, 'Default'];
const commit = value('TEAMS_COMMIT');
const buildName = [
  value('TEAMS_JOB_NAME'),
  value('TEAMS_BUILD_NUMBER') && `#${value('TEAMS_BUILD_NUMBER')}`,
].filter(Boolean).join(' ') || '-';
const build = value('TEAMS_BUILD_URL')
  ? `[${buildName}](${value('TEAMS_BUILD_URL')})`
  : buildName;
const pullRequest = value('TEAMS_DEPLOYMENT_REF')
  ? value('TEAMS_DEPLOYMENT_URL')
    ? `[${value('TEAMS_DEPLOYMENT_REF')}](${value('TEAMS_DEPLOYMENT_URL')})`
    : value('TEAMS_DEPLOYMENT_REF')
  : '';
const source = [value('TEAMS_DEPLOYMENT_TYPE'), pullRequest]
  .filter(Boolean)
  .join(' · ') || '-';
const actor = [
  value('TEAMS_DEPLOYMENT_ACTOR_LABEL'),
  value('TEAMS_DEPLOYMENT_ACTOR'),
].filter(Boolean).join(': ') || '-';

const payload = {
  type: 'message',
  attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    contentUrl: null,
    content: {
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.2',
      body: [
        {
          type: 'TextBlock',
          text: 'ChartDB 사내 서버 배포',
          weight: 'Bolder',
          size: 'Medium',
          color: statusColor,
          wrap: true,
        },
        {
          type: 'FactSet',
          facts: [
            { title: '상태', value: statusLabel },
            { title: 'Jenkins 작업/빌드', value: build },
            { title: '브랜치', value: value('TEAMS_BRANCH_NAME') || '-' },
            { title: '커밋', value: commit ? commit.slice(0, 8) : '-' },
            { title: '배포 출처', value: source },
            { title: '작업자', value: actor },
            { title: '시작', value: value('TEAMS_STARTED_AT') || '-' },
            { title: '종료', value: value('TEAMS_FINISHED_AT') || '-' },
            {
              title: '소요시간',
              value: value('TEAMS_DURATION_SEC')
                ? `${value('TEAMS_DURATION_SEC')}초`
                : '-',
            },
          ],
        },
      ],
    },
  }],
};

async function main() {
  const response = await fetch(value('TEAMS_WEBHOOK_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  console.log('[teams] notification sent');
}

main().catch((error) => {
  console.error(`[teams] notification failed: ${error.message.startsWith('HTTP ') ? error.message : 'network error'}`);
  process.exitCode = 1;
});
NODE
