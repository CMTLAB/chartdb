import { describe, it, expect, vi } from 'vitest';
import {
    computeHash,
    seedSharedDiagrams,
    shouldReseed,
} from './shared-diagram';

describe('shared-diagram', () => {
    it('computeHash is deterministic and sensitive to change', () => {
        expect(computeHash('{"a":1}')).toBe(computeHash('{"a":1}'));
        expect(computeHash('{"a":1}')).not.toBe(computeHash('{"a":2}'));
    });

    it('shouldReseed when the file changed', () => {
        expect(shouldReseed(true, 'old', 'new')).toBe(true);
    });

    it('does not reseed when unchanged and the diagram still exists', () => {
        expect(shouldReseed(true, 'same', 'same')).toBe(false);
    });

    it('reseeds when the diagram is missing even if the hash matches', () => {
        expect(shouldReseed(false, 'same', 'same')).toBe(true);
    });

    it('keeps the existing shared diagram when replacement cloning fails', async () => {
        const deleteDiagram = vi.fn();
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    text: async () =>
                        JSON.stringify([{ slug: 'demo', name: 'Demo' }]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    text: async () =>
                        JSON.stringify({
                            name: 'Demo',
                            databaseType: 'oracle',
                            tables: [{ id: 'broken' }],
                        }),
                })
        );

        await seedSharedDiagrams({
            getDiagram: vi.fn().mockResolvedValue({ id: 'shared-demo' }),
            addDiagram: vi.fn(),
            deleteDiagram,
        });

        expect(deleteDiagram).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
