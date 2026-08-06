import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseType } from './domain/database-type';
import type { Diagram } from './domain/diagram';
import { serverDiagramLocalId, syncServerDiagrams } from './shared-diagram';

const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const localDiagram = (updatedAt: string): Diagram => ({
    id: serverDiagramLocalId('allowed'),
    name: 'Allowed',
    databaseType: DatabaseType.POSTGRESQL,
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [
        {
            id: 'local-note',
            content: 'unpublished local edit',
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            color: '#ffffff',
        },
    ],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date(updatedAt),
});

const stubChangedServerDiagram = () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    diagrams: [
                        {
                            id: 'allowed',
                            name: 'Allowed',
                            currentVersion: 2,
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    id: 'allowed',
                    currentVersion: 2,
                    diagram: {
                        id: 'remote-id',
                        name: 'Allowed',
                        databaseType: 'postgresql',
                        tables: [],
                        relationships: [],
                        dependencies: [],
                        areas: [],
                        customTypes: [],
                        notes: [],
                    },
                })
            )
    );
};

const fullDiagramOptions = {
    includeTables: true,
    includeRelationships: true,
    includeDependencies: true,
    includeAreas: true,
    includeCustomTypes: true,
    includeNotes: true,
};

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('syncServerDiagrams', () => {
    it('adds authorized server diagrams and removes a revoked cached diagram', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({ revoked: 1 })
        );
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    diagrams: [
                        {
                            id: 'allowed',
                            name: 'Allowed',
                            currentVersion: 2,
                            updatedAt: '2026-08-04T00:00:00.000Z',
                            canPublish: false,
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    id: 'allowed',
                    currentVersion: 2,
                    diagram: {
                        id: 'exported-id',
                        name: 'Allowed',
                        databaseType: 'postgresql',
                        tables: [],
                        relationships: [],
                        dependencies: [],
                        areas: [],
                        customTypes: [],
                        notes: [],
                    },
                })
            );
        vi.stubGlobal('fetch', fetchMock);
        const storage = {
            getDiagram: vi.fn().mockResolvedValue(undefined),
            addDiagram: vi.fn(),
            deleteDiagram: vi.fn(),
        };

        const count = await syncServerDiagrams({
            userId: 'viewer-1',
            ...storage,
        });

        expect(count).toBe(1);
        expect(storage.deleteDiagram).toHaveBeenCalledWith(
            serverDiagramLocalId('revoked')
        );
        expect(storage.addDiagram).toHaveBeenCalledWith({
            diagram: expect.objectContaining({
                id: serverDiagramLocalId('allowed'),
                name: 'Allowed',
            }),
        });
    });

    it('keeps the existing cached diagram when replacement data is malformed', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({ allowed: 1 })
        );
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(
                    jsonResponse({
                        diagrams: [
                            {
                                id: 'allowed',
                                name: 'Allowed',
                                currentVersion: 2,
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(
                    jsonResponse({
                        id: 'allowed',
                        currentVersion: 2,
                        diagram: { name: 'broken' },
                    })
                )
        );
        const deleteDiagram = vi.fn();

        await syncServerDiagrams({
            userId: 'viewer-1',
            getDiagram: vi.fn().mockResolvedValue({ id: 'server-allowed' }),
            addDiagram: vi.fn(),
            deleteDiagram,
        });

        expect(deleteDiagram).not.toHaveBeenCalledWith(
            serverDiagramLocalId('allowed')
        );
    });

    it('backs up unpublished local edits before adopting a new server version', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({
                allowed: {
                    version: 1,
                    syncedAt: '2026-08-02T00:00:00.000Z',
                },
            })
        );
        stubChangedServerDiagram();
        const existing = localDiagram('2026-08-03T00:00:00.000Z');
        const storage = {
            getDiagram: vi.fn().mockResolvedValue(existing),
            addDiagram: vi.fn().mockResolvedValue(undefined),
            deleteDiagram: vi.fn().mockResolvedValue(undefined),
        };

        await syncServerDiagrams({ userId: 'viewer-1', ...storage });

        expect(storage.getDiagram).toHaveBeenCalledWith(
            serverDiagramLocalId('allowed'),
            fullDiagramOptions
        );
        expect(storage.addDiagram).toHaveBeenCalledTimes(2);
        const backup = storage.addDiagram.mock.calls[0][0].diagram;
        expect(backup.id).not.toBe(serverDiagramLocalId('allowed'));
        expect(backup.name).toBe('Allowed (Local backup)');
        expect(backup.notes?.[0].content).toBe('unpublished local edit');
        expect(storage.deleteDiagram).toHaveBeenCalledWith(
            serverDiagramLocalId('allowed')
        );
        expect(storage.deleteDiagram).not.toHaveBeenCalledWith(backup.id);
        expect(
            JSON.parse(
                localStorage.getItem('chartdb:serverDiagrams:viewer-1') ?? '{}'
            ).allowed
        ).toEqual({ version: 2, syncedAt: expect.any(String) });
    });

    it('does not delete the cached diagram when its backup fails', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({
                allowed: {
                    version: 1,
                    syncedAt: '2026-08-02T00:00:00.000Z',
                },
            })
        );
        stubChangedServerDiagram();
        const deleteDiagram = vi.fn();

        await syncServerDiagrams({
            userId: 'viewer-1',
            getDiagram: vi
                .fn()
                .mockResolvedValue(localDiagram('2026-08-03T00:00:00.000Z')),
            addDiagram: vi.fn().mockRejectedValueOnce(new Error('quota')),
            deleteDiagram,
        });

        expect(deleteDiagram).not.toHaveBeenCalledWith(
            serverDiagramLocalId('allowed')
        );
    });

    it('keeps the backup when adding the new server cache fails', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({
                allowed: {
                    version: 1,
                    syncedAt: '2026-08-02T00:00:00.000Z',
                },
            })
        );
        stubChangedServerDiagram();
        const addDiagram = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('write failed'));
        const deleteDiagram = vi.fn();

        await syncServerDiagrams({
            userId: 'viewer-1',
            getDiagram: vi
                .fn()
                .mockResolvedValue(localDiagram('2026-08-03T00:00:00.000Z')),
            addDiagram,
            deleteDiagram,
        });

        const backup = addDiagram.mock.calls[0][0].diagram;
        expect(backup.name).toBe('Allowed (Local backup)');
        expect(deleteDiagram).toHaveBeenCalledWith(
            serverDiagramLocalId('allowed')
        );
        expect(deleteDiagram).not.toHaveBeenCalledWith(backup.id);
    });

    it('removes a temporary backup after replacing an unchanged cache', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({
                allowed: {
                    version: 1,
                    syncedAt: '2026-08-03T00:00:00.000Z',
                },
            })
        );
        stubChangedServerDiagram();
        const storage = {
            getDiagram: vi
                .fn()
                .mockResolvedValue(localDiagram('2026-08-02T00:00:00.000Z')),
            addDiagram: vi.fn().mockResolvedValue(undefined),
            deleteDiagram: vi.fn().mockResolvedValue(undefined),
        };

        await syncServerDiagrams({ userId: 'viewer-1', ...storage });

        expect(storage.addDiagram).toHaveBeenCalledTimes(2);
        const backupId = storage.addDiagram.mock.calls[0][0].diagram.id;
        expect(storage.deleteDiagram).toHaveBeenCalledWith(backupId);
    });

    it('reads numeric manifests and rewrites them with a sync timestamp', async () => {
        localStorage.setItem(
            'chartdb:serverDiagrams:viewer-1',
            JSON.stringify({ allowed: 1 })
        );
        stubChangedServerDiagram();

        await syncServerDiagrams({
            userId: 'viewer-1',
            getDiagram: vi
                .fn()
                .mockResolvedValue(localDiagram('2026-08-03T00:00:00.000Z')),
            addDiagram: vi.fn().mockResolvedValue(undefined),
            deleteDiagram: vi.fn().mockResolvedValue(undefined),
        });

        expect(
            JSON.parse(
                localStorage.getItem('chartdb:serverDiagrams:viewer-1') ?? '{}'
            ).allowed
        ).toEqual({ version: 2, syncedAt: expect.any(String) });
    });
});
