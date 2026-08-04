import { apiFetch } from './api';
import { cloneDiagram } from './clone';
import type { Diagram } from './domain/diagram';

export const serverDiagramLocalId = (serverId: string) => `server-${serverId}`;

export const parseServerDiagramLocalId = (localId: string): string | null =>
    localId.startsWith('server-') ? localId.slice('server-'.length) : null;

const manifestKey = (userId: string) => `chartdb:serverDiagrams:${userId}`;

interface ManifestEntry {
    version: number;
    syncedAt?: string;
}

const normalizeManifestEntry = (value: unknown): ManifestEntry | null => {
    if (Number.isInteger(value)) {
        return { version: value as number };
    }
    const entry = value as Partial<ManifestEntry> | null;
    if (
        !entry ||
        !Number.isInteger(entry.version) ||
        (entry.syncedAt !== undefined && typeof entry.syncedAt !== 'string')
    ) {
        return null;
    }
    return { version: entry.version as number, syncedAt: entry.syncedAt };
};

const readManifest = (userId: string): Record<string, ManifestEntry> => {
    try {
        const value = JSON.parse(
            localStorage.getItem(manifestKey(userId)) ?? '{}'
        );
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return Object.fromEntries(
            Object.entries(value).flatMap(([serverId, entry]) => {
                const normalized = normalizeManifestEntry(entry);
                return normalized ? [[serverId, normalized]] : [];
            })
        );
    } catch {
        return {};
    }
};

const writeManifest = (
    userId: string,
    manifest: Record<string, ManifestEntry>
) => {
    localStorage.setItem(manifestKey(userId), JSON.stringify(manifest));
};

export const markServerDiagramVersion = (
    userId: string,
    serverId: string,
    version: number
) => {
    const manifest = readManifest(userId);
    manifest[serverId] = { version, syncedAt: new Date().toISOString() };
    writeManifest(userId, manifest);
};

interface DiagramLoadOptions {
    includeTables?: boolean;
    includeRelationships?: boolean;
    includeDependencies?: boolean;
    includeAreas?: boolean;
    includeCustomTypes?: boolean;
    includeNotes?: boolean;
}

interface SyncStorage {
    getDiagram: (
        id: string,
        options?: DiagramLoadOptions
    ) => Promise<Diagram | undefined>;
    addDiagram: (params: { diagram: Diagram }) => Promise<void>;
    deleteDiagram: (id: string) => Promise<void>;
}

interface SyncOptions extends SyncStorage {
    userId: string;
}

interface DiagramListItem {
    id: string;
    name: string;
    currentVersion: number;
}

const fullDiagramOptions: DiagramLoadOptions = {
    includeTables: true,
    includeRelationships: true,
    includeDependencies: true,
    includeAreas: true,
    includeCustomTypes: true,
    includeNotes: true,
};

const isListItem = (value: unknown): value is DiagramListItem => {
    const item = value as DiagramListItem;
    return (
        typeof item?.id === 'string' &&
        typeof item?.name === 'string' &&
        Number.isInteger(item?.currentVersion)
    );
};

const isDiagram = (value: unknown): value is Diagram => {
    const diagram = value as Diagram;
    return (
        typeof diagram?.id === 'string' &&
        typeof diagram?.name === 'string' &&
        typeof diagram?.databaseType === 'string' &&
        Array.isArray(diagram?.tables) &&
        Array.isArray(diagram?.relationships)
    );
};

export const syncServerDiagrams = async ({
    userId,
    getDiagram,
    addDiagram,
    deleteDiagram,
}: SyncOptions): Promise<number> => {
    let list: { diagrams: unknown[] };
    try {
        list = await apiFetch<{ diagrams: unknown[] }>('/api/diagrams');
    } catch {
        return 0;
    }
    const entries = Array.isArray(list.diagrams)
        ? list.diagrams.filter(isListItem)
        : [];
    const previous = readManifest(userId);
    const allowedIds = new Set(entries.map((entry) => entry.id));

    for (const serverId of Object.keys(previous)) {
        if (!allowedIds.has(serverId)) {
            await deleteDiagram(serverDiagramLocalId(serverId));
        }
    }

    const next: Record<string, ManifestEntry> = {};
    for (const entry of entries) {
        const localId = serverDiagramLocalId(entry.id);
        const existing = await getDiagram(localId, fullDiagramOptions);
        const previousEntry = previous[entry.id];
        if (existing && previousEntry?.version === entry.currentVersion) {
            next[entry.id] = previousEntry;
            continue;
        }

        try {
            const response = await apiFetch<{
                currentVersion: number;
                diagram: unknown;
            }>(`/api/diagrams/${entry.id}`);
            if (!isDiagram(response.diagram)) {
                if (existing && previousEntry) {
                    next[entry.id] = previousEntry;
                }
                continue;
            }
            let backup: Diagram | undefined;
            let locallyModified = false;
            if (existing) {
                const lastSync = previousEntry?.syncedAt
                    ? Date.parse(previousEntry.syncedAt)
                    : Number.NaN;
                const lastUpdate = new Date(existing.updatedAt).getTime();
                locallyModified =
                    !Number.isFinite(lastSync) ||
                    !Number.isFinite(lastUpdate) ||
                    lastUpdate > lastSync;
                backup = cloneDiagram(existing).diagram;
                backup.name = `${existing.name} (Local backup)`;
                await addDiagram({ diagram: backup });
            }
            const syncedAt = new Date().toISOString();
            const cloned = cloneDiagram(response.diagram).diagram;
            if (existing) await deleteDiagram(localId);
            await addDiagram({
                diagram: {
                    ...cloned,
                    id: localId,
                    createdAt: new Date(),
                    updatedAt: new Date(syncedAt),
                },
            });
            if (backup && !locallyModified) {
                try {
                    await deleteDiagram(backup.id);
                } catch {
                    // ponytail: stale backup is safer than undoing a valid adopted cache.
                }
            }
            next[entry.id] = {
                version: response.currentVersion,
                syncedAt,
            };
        } catch {
            if (existing && previousEntry) {
                next[entry.id] = previousEntry;
            }
        }
    }
    writeManifest(userId, next);
    return entries.length;
};
