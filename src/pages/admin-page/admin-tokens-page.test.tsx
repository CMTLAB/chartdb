import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { AdminTokensPage } from './admin-tokens-page';

const activeToken = {
    id: 'active-id',
    label: 'nightly-import',
    createdAt: '2026-08-06T00:00:00.000Z',
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: '2026-08-06T01:00:00.000Z',
    owner: {
        id: 'publisher-id',
        username: 'publisher',
        displayName: 'Publisher Kim',
        department: 'Data Platform',
        active: true,
    },
};

const revokedToken = {
    ...activeToken,
    id: 'revoked-id',
    label: 'old-token',
    revokedAt: '2026-08-06T02:00:00.000Z',
};

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('uses the same compact padded list layout as user management', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ tokens: [activeToken] }))
    );
    render(<AdminTokensPage />);

    const row = (await screen.findByText('nightly-import')).closest('tr');
    expect(row).toHaveClass(
        'px-6',
        'md:grid',
        'md:grid-cols-[minmax(180px,1fr)_220px_90px_240px_64px]'
    );
    const header = screen
        .getByRole('columnheader', { name: '토큰' })
        .closest('tr');
    expect(header).toHaveClass(
        'px-6',
        'grid-cols-[minmax(180px,1fr)_220px_90px_240px_64px]'
    );
});

it('shows token owners and filters by owner and status', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
            response({
                tokens: [
                    activeToken,
                    revokedToken,
                    {
                        ...activeToken,
                        id: 'expired-id',
                        label: 'expired-token',
                        expiresAt: '2020-01-01T00:00:00.000Z',
                    },
                ],
            })
        )
    );
    render(<AdminTokensPage />);

    expect(await screen.findByText('nightly-import')).toBeVisible();
    expect(screen.getAllByText('Publisher Kim')).not.toHaveLength(0);
    expect(screen.getAllByText('@publisher')).not.toHaveLength(0);
    expect(screen.getAllByText('Data Platform')).not.toHaveLength(0);
    expect(screen.getAllByText('만료됨')).not.toHaveLength(0);

    fireEvent.change(screen.getByRole('searchbox', { name: '토큰 검색' }), {
        target: { value: 'old-token' },
    });
    expect(screen.queryByText('nightly-import')).not.toBeInTheDocument();
    expect(screen.getByText('old-token')).toBeVisible();

    fireEvent.change(screen.getByLabelText('토큰 상태 필터'), {
        target: { value: 'active' },
    });
    expect(screen.getByText('조건에 맞는 토큰이 없습니다.')).toBeVisible();
});

it('paginates token lists in groups of twenty', async () => {
    const tokens = Array.from({ length: 21 }, (_, index) => ({
        ...activeToken,
        id: `token-${index + 1}`,
        label: `token-${String(index + 1).padStart(2, '0')}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ tokens })));
    const user = userEvent.setup();
    render(<AdminTokensPage />);

    expect(await screen.findByText('token-01')).toBeVisible();
    expect(screen.queryByText('token-21')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to next page' }));
    expect(screen.getByText('token-21')).toBeVisible();
    expect(screen.queryByText('token-01')).not.toBeInTheDocument();
});

it('requires confirmation before an administrator revokes a token', async () => {
    let revoked = false;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/admin/tokens' && !init?.method)
            return response({
                tokens: [
                    revoked
                        ? {
                              ...activeToken,
                              revokedAt: '2026-08-06T03:00:00.000Z',
                          }
                        : activeToken,
                ],
            });
        if (
            input === '/api/admin/tokens/active-id' &&
            init?.method === 'DELETE'
        ) {
            revoked = true;
            return response({}, 204);
        }
        throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AdminTokensPage />);

    await user.click(await screen.findByRole('button', { name: '폐기' }));
    expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')
    ).toBe(false);
    expect(
        screen.getByRole('alertdialog', {
            name: 'nightly-import 토큰을 폐기할까요?',
        })
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '토큰 폐기' }));
    expect(await screen.findAllByText('폐기됨')).not.toHaveLength(0);
});

it('keeps the revoke confirmation open when the server rejects it', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/admin/tokens' && !init?.method)
            return response({ tokens: [activeToken] });
        if (
            input === '/api/admin/tokens/active-id' &&
            init?.method === 'DELETE'
        )
            return response({ error: '토큰을 폐기하지 못했습니다.' }, 500);
        throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AdminTokensPage />);

    await user.click(await screen.findByRole('button', { name: '폐기' }));
    await user.click(screen.getByRole('button', { name: '토큰 폐기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        '토큰을 폐기하지 못했습니다.'
    );
    expect(screen.getByRole('alertdialog')).toBeVisible();
});
