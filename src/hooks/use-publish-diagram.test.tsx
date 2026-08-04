import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import { usePublishDiagram } from './use-publish-diagram';

const toast = vi.fn();
const addDiagram = vi.fn();
const deleteDiagram = vi.fn();
const navigate = vi.fn();

vi.mock('@/components/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));
vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({ addDiagram, deleteDiagram }),
}));
vi.mock('@/context/auth-context/auth-context', () => ({
    useAuth: () => ({
        user: {
            id: 'publisher-id',
            username: 'publisher',
            role: 'PUBLISHER',
        },
    }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: 'ko' } }),
}));
vi.mock('react-router-dom', () => ({
    useNavigate: () => navigate,
}));

const localDiagram = {
    id: 'local-diagram-1',
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

afterEach(() => {
    localStorage.clear();
    toast.mockReset();
    addDiagram.mockReset();
    deleteDiagram.mockReset();
    navigate.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('usePublishDiagram', () => {
    it('creates a server diagram with the login session and never prompts for a global token', async () => {
        const prompt = vi.spyOn(window, 'prompt');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ id: 'server-id', version: 1 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const { result } = renderHook(() => usePublishDiagram());

        await act(async () => result.current.publish(localDiagram));

        expect(prompt).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/diagrams',
            expect.objectContaining({
                method: 'POST',
                credentials: 'same-origin',
            })
        );
        expect(navigate).toHaveBeenCalledWith('/diagrams/server-server-id');
    });

    it('publishes a new version when the local diagram is server-backed', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ id: 'server-id', version: 2 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const { result } = renderHook(() => usePublishDiagram());

        await act(async () =>
            result.current.publish({
                ...localDiagram,
                id: 'server-server-id',
            })
        );

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/diagrams/server-id/versions',
            expect.objectContaining({ method: 'POST' })
        );
        expect(addDiagram).not.toHaveBeenCalled();
    });

    it('does not mark a new server diagram before its local cache is adopted', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 201,
                json: async () => ({ id: 'server-id', version: 1 }),
            })
        );
        addDiagram.mockRejectedValueOnce(new Error('quota'));
        const { result } = renderHook(() => usePublishDiagram());

        await act(async () => result.current.publish(localDiagram));

        expect(
            localStorage.getItem('chartdb:serverDiagrams:publisher-id')
        ).toBeNull();
        expect(deleteDiagram).not.toHaveBeenCalledWith(localDiagram.id);
    });
});
