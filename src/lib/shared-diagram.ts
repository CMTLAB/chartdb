import { cloneDiagram } from './clone';
import type { Diagram } from './domain/diagram';

// Shared team ERDs served by the publish sidecar. The server exposes:
//   /shared/index.json      -> [{ slug, name }, ...]
//   /shared/<slug>.json     -> a ChartDB diagram export
// Each is seeded into this browser's IndexedDB as a normal diagram (id `shared-<slug>`)
// so it shows up in the "All Databases" list. A full page reload re-syncs to the latest;
// if the server serves nothing, every step here no-ops and the app behaves normally.

export const SHARED_INDEX_URL = '/shared/index.json';
export const sharedDiagramUrl = (slug: string) => `/shared/${slug}.json`;
export const sharedDiagramId = (slug: string) => `shared-${slug}`;

const SLUGS_KEY = 'chartdb:sharedSlugs';
const hashKey = (slug: string) => `chartdb:sharedHash:${slug}`;

// FNV-1a — not cryptographic, only used to detect "this shared file changed".
// ponytail: FNV-1a change-detection, swap for crypto.subtle only if collisions ever bite.
export const computeHash = (text: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
};

// Re-seed when the file changed, or when it matches but the diagram is gone from
// IndexedDB (e.g. the viewer cleared site data while localStorage survived).
export const shouldReseed = (
    diagramExists: boolean,
    storedHash: string | null,
    newHash: string
): boolean => !diagramExists || storedHash !== newHash;

// Called right after the author publishes: records the just-published content as
// already-seed so a reload doesn't reseed-overwrite the copy they keep editing, and
// registers the slug so cleanup keeps it.
export const markSharedSeeded = (slug: string, text: string): void => {
    localStorage.setItem(hashKey(slug), computeHash(text));
    let slugs: string[] = [];
    try {
        const stored = JSON.parse(localStorage.getItem(SLUGS_KEY) ?? '[]');
        slugs = Array.isArray(stored) ? stored : [];
    } catch {
        slugs = [];
    }
    if (!slugs.includes(slug)) {
        slugs.push(slug);
        localStorage.setItem(SLUGS_KEY, JSON.stringify(slugs));
    }
};

interface SeedDeps {
    getDiagram: (id: string) => Promise<Diagram | undefined>;
    addDiagram: (params: { diagram: Diagram }) => Promise<void>;
    deleteDiagram: (id: string) => Promise<void>;
}

interface IndexEntry {
    slug: string;
    name: string;
}

const fetchText = async (url: string): Promise<string | null> => {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            return null;
        }
        return await res.text();
    } catch {
        return null;
    }
};

const seedOne = async (
    { getDiagram, addDiagram, deleteDiagram }: SeedDeps,
    entry: IndexEntry
): Promise<void> => {
    const text = await fetchText(sharedDiagramUrl(entry.slug));
    if (text === null) {
        return;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return;
    }
    // Trust the published export (the sidecar already checked it is diagram-shaped)
    // rather than re-validating with the strict diagramSchema, which rejects values
    // real ChartDB diagrams carry (e.g. Oracle's 'normal' index type).
    const obj = parsed as Partial<Diagram>;
    if (
        typeof obj?.name !== 'string' ||
        typeof obj?.databaseType !== 'string'
    ) {
        return;
    }

    const id = sharedDiagramId(entry.slug);
    const hash = computeHash(text);
    const existing = await getDiagram(id);
    if (
        !shouldReseed(
            !!existing,
            localStorage.getItem(hashKey(entry.slug)),
            hash
        )
    ) {
        return;
    }

    // Regenerate every internal id (tables/fields/indexes/relationships/...) so that
    // shared diagrams — which share running ids like "1","2" in their exports — never
    // collide with each other or with the user's own diagrams in the id-keyed stores.
    const cloned = cloneDiagram(obj as Diagram).diagram;
    if (existing) {
        await deleteDiagram(id);
    }
    await addDiagram({
        diagram: {
            ...cloned,
            id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
    localStorage.setItem(hashKey(entry.slug), hash);
};

const doSeed = async (deps: SeedDeps): Promise<number> => {
    const indexText = await fetchText(SHARED_INDEX_URL);
    if (indexText === null) {
        return 0;
    }

    let index: IndexEntry[];
    try {
        const parsed = JSON.parse(indexText);
        index = Array.isArray(parsed) ? parsed : [];
    } catch {
        return 0;
    }
    const entries = index.filter(
        (e) => e && typeof e.slug === 'string' && typeof e.name === 'string'
    );

    // Drop any shared diagram that was removed from the index server-side.
    const currentSlugs = new Set(entries.map((e) => e.slug));
    let knownSlugs: string[] = [];
    try {
        const stored = JSON.parse(localStorage.getItem(SLUGS_KEY) ?? '[]');
        knownSlugs = Array.isArray(stored) ? stored : [];
    } catch {
        knownSlugs = [];
    }
    for (const slug of knownSlugs) {
        if (!currentSlugs.has(slug)) {
            await deps.deleteDiagram(sharedDiagramId(slug));
            localStorage.removeItem(hashKey(slug));
        }
    }

    for (const entry of entries) {
        await seedOne(deps, entry);
    }

    localStorage.setItem(SLUGS_KEY, JSON.stringify([...currentSlugs]));
    return entries.length;
};

// Memoized: sync at most once per page load. New publishes are picked up on reload,
// which is exactly the "reload to get the latest team ERDs" sharing model.
let seedPromise: Promise<number> | null = null;

export const seedSharedDiagrams = (deps: SeedDeps): Promise<number> => {
    if (!seedPromise) {
        seedPromise = doSeed(deps).catch(() => 0);
    }
    return seedPromise;
};
