import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
                        versions: [
                            {
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
                            },
                        ],
                    })
                )
        );

        render(
            <MemoryRouter initialEntries={['/versions/diagram-id']}>
                <Routes>
                    <Route
                        path="/versions/:diagramId"
                        element={<VersionsPage />}
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(
            await screen.findByText('Team ERD 버전 이력')
        ).toBeInTheDocument();
        expect(screen.getByText('Publisher Kim')).toBeInTheDocument();
        expect(screen.getByText('Added customer table')).toBeInTheDocument();
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
