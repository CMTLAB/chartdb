import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokensPage } from './tokens-page/tokens-page';
import { VersionsPage } from './versions-page/versions-page';

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const versionTwo = {
    id: 'version-id',
    version: 2,
    changedBy: {
        id: 'publisher-id',
        username: 'publisher',
        displayName: 'Publisher Kim',
    },
    source: 'WEB',
    changeNote: 'Added customer table',
    createdAt: '2026-08-04T00:00:00.000Z',
};

const renderVersionsPage = () =>
    render(
        <MemoryRouter initialEntries={['/versions/diagram-id']}>
            <Routes>
                <Route path="/versions/:diagramId" element={<VersionsPage />} />
            </Routes>
        </MemoryRouter>
    );

describe('VersionsPage', () => {
    it('shows version actor, source, and change note', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(
                    response({
                        id: 'diagram-id',
                        name: 'Team ERD',
                        canPublish: true,
                        diagram: {},
                    })
                )
                .mockResolvedValueOnce(
                    response({
                        versions: [versionTwo],
                    })
                )
        );

        renderVersionsPage();

        expect(
            await screen.findByText('Team ERD 버전 이력')
        ).toBeInTheDocument();
        expect(screen.getByText('Publisher Kim')).toBeInTheDocument();
        expect(screen.getByText('Added customer table')).toBeInTheDocument();
    });

    it('warns before a restore immediately changes the server version', async () => {
        const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
            if (input === '/api/diagrams/diagram-id')
                return response({ name: 'Team ERD', canPublish: true });
            if (input === '/api/diagrams/diagram-id/versions')
                return response({ versions: [versionTwo] });
            if (
                input.endsWith('/versions/2/restore') &&
                init?.method === 'POST'
            )
                return response({ version: 3 }, 201);
            throw new Error(`Unexpected request: ${input}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const user = userEvent.setup();
        renderVersionsPage();

        await user.click(
            await screen.findByRole('button', { name: '이 버전 복원' })
        );
        expect(
            fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')
        ).toBe(false);
        expect(
            screen.getByRole('alertdialog', {
                name: '버전 2 복원을 진행할까요?',
            })
        ).toBeVisible();
        expect(
            screen.getByText(
                '복원하면 선택한 버전이 서버의 새 최신 버전으로 즉시 발행됩니다.'
            )
        ).toBeVisible();
        expect(
            screen.getByText(
                '필요하면 현재 작업본을 먼저 발행하거나, 이 버전을 JSON으로 다운로드해 별도로 확인하세요.'
            )
        ).toBeVisible();

        await user.click(
            screen.getByRole('button', { name: '복원 및 즉시 반영' })
        );
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/diagrams/diagram-id/versions/2/restore',
                expect.objectContaining({ method: 'POST' })
            )
        );
    });

    it('locks the restore dialog and keeps the error visible on failure', async () => {
        let resolveRestore!: (value: ReturnType<typeof response>) => void;
        const pendingRestore = new Promise<ReturnType<typeof response>>(
            (resolve) => {
                resolveRestore = resolve;
            }
        );
        const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
            if (input === '/api/diagrams/diagram-id')
                return response({ name: 'Team ERD', canPublish: true });
            if (input === '/api/diagrams/diagram-id/versions')
                return response({ versions: [versionTwo] });
            if (
                input.endsWith('/versions/2/restore') &&
                init?.method === 'POST'
            )
                return pendingRestore;
            throw new Error(`Unexpected request: ${input}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const user = userEvent.setup();
        renderVersionsPage();

        await user.click(
            await screen.findByRole('button', { name: '이 버전 복원' })
        );
        await user.click(
            screen.getByRole('button', { name: '복원 및 즉시 반영' })
        );
        expect(screen.getByRole('button', { name: '복원 중…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

        resolveRestore(response({ error: '복원 실패' }, 500));
        expect(await screen.findByRole('alert')).toHaveTextContent('복원 실패');
        expect(screen.getByRole('alertdialog')).toBeVisible();
    });
});

describe('TokensPage', () => {
    it('shows a newly created token exactly in the creation result', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response({ tokens: [] }))
            .mockResolvedValueOnce(
                response(
                    {
                        token: 'cdb_plaintext-once',
                        item: {
                            id: 'token-id',
                            label: 'nightly',
                            createdAt: '2026-08-04T00:00:00.000Z',
                            revokedAt: null,
                            lastUsedAt: null,
                        },
                    },
                    201
                )
            );
        vi.stubGlobal('fetch', fetchMock);
        render(
            <MemoryRouter>
                <TokensPage />
            </MemoryRouter>
        );
        await screen.findByText('발급된 토큰이 없습니다.');

        fireEvent.change(screen.getByLabelText('토큰 이름'), {
            target: { value: 'nightly' },
        });
        fireEvent.click(screen.getByRole('button', { name: '토큰 생성' }));

        expect(
            await screen.findByText('cdb_plaintext-once')
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenLastCalledWith(
                '/api/tokens',
                expect.objectContaining({ method: 'POST' })
            )
        );
    });
});
