import { readdir } from 'node:fs/promises';

const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const requiredWorkers = ['editor.worker-', 'json.worker-'];
const forbiddenAssets = [
    'css.worker-',
    'html.worker-',
    'ts.worker-',
    'bn_IN-',
    'de-',
    'es-',
    'fr-',
    'hi_IN-',
    'ja-',
    'pt_BR-',
    'ru-',
    'zh_CN-',
    'zh_TW-',
];
const missing = requiredWorkers.filter(
    (prefix) => !assets.some((file) => file.startsWith(prefix))
);
const unused = assets.filter((file) =>
    forbiddenAssets.some((prefix) => file.startsWith(prefix))
);

if (missing.length > 0) {
    throw new Error(`Required Monaco workers missing: ${missing.join(', ')}`);
}

if (unused.length > 0) {
    throw new Error(`Unused bundle assets found: ${unused.join(', ')}`);
}
