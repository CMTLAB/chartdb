import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import { usePublishDiagram } from './use-publish-diagram';

vi.mock('@/components/toast/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({ addDiagram: vi.fn(), deleteDiagram: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: 'ko' } }),
}));
vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('usePublishDiagram', () => {
    it('asks for a fresh token for every publish without caching it', async () => {
        localStorage.setItem('chartdb:publishToken', 'cached-token');
        const prompt = vi
            .spyOn(window, 'prompt')
            .mockReturnValueOnce('token-one')
            .mockReturnValueOnce('token-two');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        });
        vi.stubGlobal('fetch', fetchMock);
        const diagram = {
            id: 'diagram-1',
            name: 'QUALYS',
            databaseType: DatabaseType.ORACLE,
            tables: [],
            relationships: [],
            dependencies: [],
            areas: [],
            customTypes: [],
            notes: [],
            createdAt: new Date('2026-08-04T00:00:00Z'),
            updatedAt: new Date('2026-08-04T00:00:00Z'),
        };
        const { result } = renderHook(() => usePublishDiagram());

        await act(async () => {
            await result.current.publish(diagram);
            await result.current.publish(diagram);
        });

        expect(prompt).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].headers['x-publish-token']).toBe(
            'token-one'
        );
        expect(fetchMock.mock.calls[1][1].headers['x-publish-token']).toBe(
            'token-two'
        );
        expect(localStorage.getItem('chartdb:publishToken')).toBeNull();
    });
});
