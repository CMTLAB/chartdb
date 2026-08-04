// Tiny publish sidecar for the shared team ERDs. Node built-ins + one bundled helper.
//
// GET  /                 -> a small browser page to upload an exported ChartDB JSON
// POST /publish          -> store an exported ChartDB *diagram* JSON (manual/UI path)
// POST /publish-metadata -> store from raw smart-query *metadata* (CI/auto path):
//                           converts metadata -> diagram server-side, then stores
// POST /unpublish        -> remove a shared ERD
//
// Files land in the shared volume as <slug>.json plus an index.json listing them all.
// nginx serves those to viewers under /shared/.

import { createServer } from 'node:http';
import { writeFile, readFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { metadataToDiagramJSON } from './convert-bundle.mjs';
import { preserveSharedLayout } from './preserve-layout.mjs';

const PORT = Number(process.env.PORT ?? 8788);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const INDEX = join(DATA_DIR, 'index.json');
const TOKEN = process.env.PUBLISH_TOKEN ?? '';
const MAX_BYTES = 50 * 1024 * 1024;

const DATABASE_TYPES = new Set([
    'generic',
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
    'clickhouse',
    'cockroachdb',
    'oracle',
]);
const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = (value) => isObject(value) && typeof value.id === 'string';
const isOptionalArray = (value, check) =>
    value === undefined || (Array.isArray(value) && value.every(check));

// Reject exports that would break the client-side clone before they reach every viewer.
export const isDiagramShaped = (diagram) =>
    hasId(diagram) &&
    typeof diagram.name === 'string' &&
    diagram.name.trim() !== '' &&
    DATABASE_TYPES.has(diagram.databaseType) &&
    isOptionalArray(
        diagram.tables,
        (table) =>
            hasId(table) &&
            Array.isArray(table.fields) &&
            table.fields.every(hasId) &&
            Array.isArray(table.indexes) &&
            table.indexes.every(
                (index) =>
                    hasId(index) &&
                    Array.isArray(index.fieldIds) &&
                    index.fieldIds.every((id) => typeof id === 'string')
            )
    ) &&
    isOptionalArray(
        diagram.relationships,
        (relationship) =>
            hasId(relationship) &&
            [
                'sourceTableId',
                'targetTableId',
                'sourceFieldId',
                'targetFieldId',
            ].every((key) => typeof relationship[key] === 'string')
    ) &&
    isOptionalArray(
        diagram.dependencies,
        (dependency) =>
            hasId(dependency) &&
            typeof dependency.dependentTableId === 'string' &&
            typeof dependency.tableId === 'string'
    ) &&
    ['areas', 'customTypes', 'notes'].every((key) =>
        isOptionalArray(diagram[key], hasId)
    );

// ponytail: one global queue; split by slug only if publish throughput becomes relevant.
let mutationQueue = Promise.resolve();
export const enqueueMutation = (operation) => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => {});
    return result;
};

// FNV-1a, appended to the slug so distinct names never collide onto one file, and
// re-publishing the same name maps back to the same file (an in-place update).
const fnv = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
};

// Only our own slug shape — guards the file path against traversal on unpublish.
const isValidSlug = (s) => typeof s === 'string' && /^[a-z0-9-]+$/.test(s);

const slugify = (name) => {
    const base = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${base || 'erd'}-${fnv(name)}`;
};

const readIndex = async () => {
    try {
        const idx = JSON.parse(await readFile(INDEX, 'utf8'));
        return Array.isArray(idx) ? idx : [];
    } catch {
        return [];
    }
};

// Write to a temp file in the same dir, then rename — atomic swap so a viewer never
// fetches a half-written file.
const writeAtomic = async (path, text) => {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, path);
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BYTES) {
                reject(new Error('too large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });

const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
    });
    res.end(body);
};

// Store a diagram export (JSON text) under a name-derived slug + index entry.
const storeDiagram = async (name, text) => {
    const slug = slugify(name);
    await mkdir(DATA_DIR, { recursive: true });
    await writeAtomic(join(DATA_DIR, `${slug}.json`), text);
    const idx = (await readIndex()).filter((e) => e.slug !== slug);
    idx.push({ slug, name });
    idx.sort((a, b) => a.name.localeCompare(b.name));
    await writeAtomic(INDEX, JSON.stringify(idx));
    return slug;
};

const readStoredDiagram = async (name) => {
    try {
        return JSON.parse(
            await readFile(join(DATA_DIR, `${slugify(name)}.json`), 'utf8')
        );
    } catch {
        return null;
    }
};

const server = createServer(async (req, res) => {
    // '/publish' too: nginx reverse-proxies that path here, so the page and the
    // POST endpoint live under the same single app port.
    if (
        req.method === 'GET' &&
        (req.url === '/' || req.url === '/index.html' || req.url === '/publish')
    ) {
        return send(res, 200, PAGE, 'text/html; charset=utf-8');
    }

    if (req.method === 'POST' && req.url === '/publish') {
        if (!TOKEN) {
            return send(
                res,
                503,
                JSON.stringify({
                    error: 'Publishing is disabled: set PUBLISH_TOKEN on the server.',
                })
            );
        }
        if (req.headers['x-publish-token'] !== TOKEN) {
            return send(res, 401, JSON.stringify({ error: 'Invalid token.' }));
        }

        let text;
        try {
            text = await readBody(req);
        } catch {
            return send(res, 413, JSON.stringify({ error: 'File too large.' }));
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return send(res, 400, JSON.stringify({ error: 'Not valid JSON.' }));
        }
        if (!isDiagramShaped(parsed)) {
            return send(
                res,
                422,
                JSON.stringify({
                    error: 'This does not look like a valid ChartDB diagram export.',
                })
            );
        }

        let slug;
        try {
            slug = await enqueueMutation(() => storeDiagram(parsed.name, text));
        } catch (e) {
            return send(
                res,
                500,
                JSON.stringify({ error: `Write failed: ${e.message}` })
            );
        }

        return send(
            res,
            200,
            JSON.stringify({ ok: true, name: parsed.name, slug })
        );
    }

    // CI / auto path: accepts raw smart-query metadata, converts to a diagram
    // server-side (same logic as ChartDB's UI import), then stores it.
    if (req.method === 'POST' && req.url === '/publish-metadata') {
        if (!TOKEN) {
            return send(
                res,
                503,
                JSON.stringify({
                    error: 'Publishing is disabled: set PUBLISH_TOKEN on the server.',
                })
            );
        }
        if (req.headers['x-publish-token'] !== TOKEN) {
            return send(res, 401, JSON.stringify({ error: 'Invalid token.' }));
        }

        let body;
        try {
            body = JSON.parse(await readBody(req));
        } catch {
            return send(res, 400, JSON.stringify({ error: 'Not valid JSON.' }));
        }
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const databaseType =
            typeof body?.databaseType === 'string' ? body.databaseType : '';
        if (!name || !databaseType || typeof body?.metadata !== 'object') {
            return send(
                res,
                422,
                JSON.stringify({
                    error: 'Required: name, databaseType, metadata.',
                })
            );
        }

        let diagramJson;
        try {
            const generatedJson = await metadataToDiagramJSON({
                name,
                databaseType,
                metadata: body.metadata,
            });
            const freshDiagram = JSON.parse(generatedJson);
            const existingDiagram = await readStoredDiagram(name);
            diagramJson = JSON.stringify(
                preserveSharedLayout(freshDiagram, existingDiagram),
                null,
                2
            );
        } catch (e) {
            return send(
                res,
                422,
                JSON.stringify({ error: `Conversion failed: ${e.message}` })
            );
        }

        let slug;
        try {
            slug = await enqueueMutation(() => storeDiagram(name, diagramJson));
        } catch (e) {
            return send(
                res,
                500,
                JSON.stringify({ error: `Write failed: ${e.message}` })
            );
        }

        return send(res, 200, JSON.stringify({ ok: true, name, slug }));
    }

    if (req.method === 'POST' && req.url === '/unpublish') {
        if (!TOKEN) {
            return send(
                res,
                503,
                JSON.stringify({ error: 'Publishing is disabled.' })
            );
        }
        if (req.headers['x-publish-token'] !== TOKEN) {
            return send(res, 401, JSON.stringify({ error: 'Invalid token.' }));
        }

        let body;
        try {
            body = JSON.parse(await readBody(req));
        } catch {
            return send(res, 400, JSON.stringify({ error: 'Not valid JSON.' }));
        }
        if (!isValidSlug(body?.slug)) {
            return send(res, 422, JSON.stringify({ error: 'Invalid slug.' }));
        }

        try {
            await enqueueMutation(async () => {
                await unlink(join(DATA_DIR, `${body.slug}.json`)).catch(
                    () => {}
                );
                const idx = (await readIndex()).filter(
                    (e) => e.slug !== body.slug
                );
                await writeAtomic(INDEX, JSON.stringify(idx));
            });
        } catch (e) {
            return send(
                res,
                500,
                JSON.stringify({ error: `Delete failed: ${e.message}` })
            );
        }

        return send(res, 200, JSON.stringify({ ok: true, slug: body.slug }));
    }

    return send(res, 404, JSON.stringify({ error: 'Not found.' }));
});

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    server.listen(PORT, () => {
        console.log(
            `publish-server listening on :${PORT}, writing ${DATA_DIR}`
        );
    });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publish shared ERD</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 560px; margin: 6vh auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.3rem; }
  p { color: #666; }
  input[type=password], input[type=file] { width: 100%; padding: 8px; margin: 6px 0 16px; box-sizing: border-box; }
  button { padding: 10px 18px; font-size: 1rem; cursor: pointer; border: 0; border-radius: 6px; background: #2563eb; color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  #msg { margin-top: 16px; padding: 12px; border-radius: 6px; white-space: pre-wrap; }
  .ok { background: #dcfce7; color: #166534; }
  .err { background: #fee2e2; color: #991b1b; }
  h2 { font-size: 1rem; margin-top: 32px; }
  ul { list-style: none; padding: 0; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #8883; }
  li button { background: #dc2626; padding: 6px 12px; font-size: .85rem; }
  .muted { color: #888; }
</style></head>
<body>
  <h1>Publish a shared team ERD</h1>
  <p>In ChartDB: edit a diagram, then <b>Export as JSON</b>. Each diagram is shared under its own name — publishing a new name adds another ERD, re-publishing the same name updates it. Teammates reload to see changes.</p>
  <label>Publish token<input id="token" type="password" placeholder="server PUBLISH_TOKEN" autocomplete="off"></label>
  <label>Exported JSON file<input id="file" type="file" accept="application/json,.json"></label>
  <button id="go">Publish</button>
  <div id="msg"></div>

  <h2>Published ERDs</h2>
  <ul id="list"></ul>
<script>
  localStorage.removeItem('publishToken');
  const $ = (id) => document.getElementById(id);
  const mutedLi = (t) => { const li = document.createElement('li'); li.className = 'muted'; li.textContent = t; return li; };

  async function loadList() {
    const ul = $('list');
    ul.replaceChildren(mutedLi('Loading…'));
    try {
      const res = await fetch('/shared/index.json', { cache: 'no-store' });
      const list = res.ok ? await res.json() : [];
      if (!Array.isArray(list) || list.length === 0) { ul.replaceChildren(mutedLi('Nothing published yet.')); return; }
      const items = list.map((e) => {
        const li = document.createElement('li');
        const span = document.createElement('span'); span.textContent = e.name;
        const btn = document.createElement('button'); btn.textContent = 'Delete';
        btn.onclick = () => unpublish(e.slug, e.name);
        li.append(span, btn); return li;
      });
      ul.replaceChildren(...items);
    } catch { ul.replaceChildren(mutedLi('Could not load list.')); }
  }

  async function unpublish(slug, name) {
    if (!confirm('Remove shared ERD "' + name + '" for everyone?')) return;
    const token = $('token').value.trim();
    const msg = $('msg'); msg.className = ''; msg.textContent = '';
    try {
      const res = await fetch('/unpublish', { method: 'POST', headers: { 'x-publish-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { msg.className = 'ok'; msg.textContent = 'Removed "' + name + '". Teammates reload to drop it.'; }
      else { msg.className = 'err'; msg.textContent = 'Delete failed (' + res.status + '): ' + (data.error || 'unknown error'); }
    } catch (e) { msg.className = 'err'; msg.textContent = 'Request failed: ' + e.message; }
    $('token').value = '';
    loadList();
  }

  $('go').onclick = async () => {
    const f = $('file').files[0];
    const token = $('token').value.trim();
    const msg = $('msg');
    msg.className = ''; msg.textContent = '';
    if (!f) { msg.className = 'err'; msg.textContent = 'Choose an exported JSON file first.'; return; }
    $('go').disabled = true;
    try {
      const body = await f.text();
      const res = await fetch('/publish', { method: 'POST', headers: { 'x-publish-token': token, 'Content-Type': 'application/json' }, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { msg.className = 'ok'; msg.textContent = 'Published "' + (data.name || f.name) + '". Tell the team to reload.'; }
      else { msg.className = 'err'; msg.textContent = 'Failed (' + res.status + '): ' + (data.error || 'unknown error'); }
    } catch (e) {
      msg.className = 'err'; msg.textContent = 'Request failed: ' + e.message;
    } finally { $('token').value = ''; $('go').disabled = false; loadList(); }
  };

  loadList();
</script>
</body></html>`;
