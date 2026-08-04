import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preserveSharedLayout } from './preserve-layout.mjs';

const publisherDir = dirname(fileURLToPath(import.meta.url));
const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const freePort = async () => {
    const probe = createNetServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address();
    await new Promise((resolve, reject) =>
        probe.close((error) => (error ? reject(error) : resolve()))
    );
    return port;
};

const table = (name, overrides = {}) => ({
    id: `fresh-${name}`,
    schema: 'CLO_QUALYS',
    name,
    x: 100,
    y: 100,
    width: 224,
    color: '#new',
    expanded: false,
    parentAreaId: null,
    order: 0,
    fields: [{ name: 'fresh_field' }],
    indexes: [{ name: 'fresh_index' }],
    comments: 'fresh comment',
    ...overrides,
});

test('preserves presentation while fresh metadata remains authoritative', () => {
    const fresh = {
        name: 'CL-Qualys',
        databaseType: 'oracle',
        tables: [
            table('CL_EX_CAR_JOB'),
            table('CL_EX_NEW', { x: 450, y: 300 }),
        ],
        relationships: [{ name: 'fresh_fk' }],
        areas: [],
        notes: [],
    };
    const existing = {
        name: 'CL-Qualys',
        databaseType: 'oracle',
        tables: [
            table('CL_EX_CAR_JOB', {
                id: 'old-job',
                x: 700,
                y: 800,
                width: 337,
                color: '#manual',
                expanded: true,
                parentAreaId: 'area-1',
                order: 9,
                fields: [{ name: 'manual_only_field' }],
                comments: 'manual comment',
            }),
            table('CL_EX_REMOVED', { id: 'old-removed' }),
        ],
        relationships: [{ name: 'manual_only_fk' }],
        areas: [
            {
                id: 'area-1',
                x: 600,
                y: 700,
                width: 500,
                height: 500,
            },
        ],
        notes: [{ id: 'note-1', content: 'keep me' }],
    };

    const merged = preserveSharedLayout(fresh, existing);
    const job = merged.tables.find((item) => item.name === 'CL_EX_CAR_JOB');
    const added = merged.tables.find((item) => item.name === 'CL_EX_NEW');

    assert.deepEqual(
        {
            x: job.x,
            y: job.y,
            width: job.width,
            color: job.color,
            expanded: job.expanded,
            parentAreaId: job.parentAreaId,
            order: job.order,
        },
        {
            x: 700,
            y: 800,
            width: 337,
            color: '#manual',
            expanded: true,
            parentAreaId: 'area-1',
            order: 9,
        }
    );
    assert.deepEqual(job.fields, [{ name: 'fresh_field' }]);
    assert.equal(job.comments, 'fresh comment');
    assert.deepEqual(merged.relationships, [{ name: 'fresh_fk' }]);
    assert.deepEqual(
        merged.tables.map((item) => item.name),
        ['CL_EX_CAR_JOB', 'CL_EX_NEW']
    );
    assert.deepEqual(merged.areas, existing.areas);
    assert.deepEqual(merged.notes, existing.notes);
    assert.ok(added.x > 1100);
});

test('keeps the fresh layout when no usable existing diagram exists', () => {
    const fresh = {
        name: 'CL-Qualys',
        databaseType: 'oracle',
        tables: [table('CL_EX_CAR_JOB')],
        areas: [],
        notes: [],
    };

    assert.equal(preserveSharedLayout(fresh, null), fresh);
    assert.equal(preserveSharedLayout(fresh, { tables: 'invalid' }), fresh);
});

test('metadata endpoint preserves a manually published layout', async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'chartdb-publisher-'));
    const port = await freePort();
    const token = 'test-token';
    const child = spawn(process.execPath, ['server.mjs'], {
        cwd: publisherDir,
        env: {
            ...process.env,
            PORT: String(port),
            DATA_DIR: dataDir,
            PUBLISH_TOKEN: token,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
        stderr += chunk;
    });
    t.after(async () => {
        if (child.exitCode === null) {
            child.kill();
            await once(child, 'exit');
        }
        await rm(dataDir, { recursive: true, force: true });
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            ready = (await fetch(`${baseUrl}/publish`)).ok;
        } catch {
            await delay(25);
        }
        if (ready) break;
    }
    assert.equal(ready, true, stderr);

    const headers = {
        'content-type': 'application/json',
        'x-publish-token': token,
    };
    const manualDiagram = {
        id: 'manual-diagram',
        name: 'CL-Qualys',
        databaseType: 'oracle',
        tables: [
            table('CL_EX_CAR_JOB', {
                x: 700,
                y: 800,
                width: 337,
                color: '#manual',
                expanded: true,
                parentAreaId: 'area-1',
                fields: [{ id: 'manual-field', name: 'MANUAL_ONLY' }],
                indexes: [
                    {
                        id: 'manual-index',
                        name: 'manual_index',
                        fieldIds: ['manual-field'],
                    },
                ],
            }),
        ],
        relationships: [
            {
                id: 'manual-relationship',
                name: 'manual_only_fk',
                sourceTableId: 'fresh-CL_EX_CAR_JOB',
                targetTableId: 'fresh-CL_EX_CAR_JOB',
                sourceFieldId: 'manual-field',
                targetFieldId: 'manual-field',
            },
        ],
        areas: [
            {
                id: 'area-1',
                x: 600,
                y: 700,
                width: 500,
                height: 500,
            },
        ],
        notes: [{ id: 'note-1', content: 'keep me' }],
    };
    const manualResponse = await fetch(`${baseUrl}/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify(manualDiagram),
    });
    assert.equal(manualResponse.status, 200);
    const { slug } = await manualResponse.json();

    const metadataResponse = await fetch(`${baseUrl}/publish-metadata`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: 'CL-Qualys',
            databaseType: 'oracle',
            metadata: {
                fk_info: [],
                pk_info: [],
                columns: [
                    {
                        schema: 'CLO_QUALYS',
                        table: 'CL_EX_CAR_JOB',
                        name: 'JOB_ID',
                        type: 'number',
                        ordinal_position: 1,
                        nullable: false,
                        comment: 'fresh column',
                    },
                ],
                indexes: [],
                tables: [
                    {
                        schema: 'CLO_QUALYS',
                        table: 'CL_EX_CAR_JOB',
                        rows: 0,
                        type: 'TABLE',
                        comment: 'fresh table',
                    },
                ],
                views: [],
                database_name: 'CLO_QUALYS',
                version: '23ai',
            },
        }),
    });
    assert.equal(metadataResponse.status, 200);

    const stored = JSON.parse(
        await readFile(join(dataDir, `${slug}.json`), 'utf8')
    );
    assert.equal(stored.tables[0].x, 700);
    assert.equal(stored.tables[0].y, 800);
    assert.equal(stored.tables[0].color, '#manual');
    assert.equal(stored.tables[0].fields[0].name, 'JOB_ID');
    assert.equal(stored.tables[0].comments, 'fresh table');
    assert.deepEqual(stored.relationships, []);
    assert.deepEqual(stored.areas, manualDiagram.areas);
    assert.deepEqual(stored.notes, manualDiagram.notes);
});
