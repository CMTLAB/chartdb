import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { AdminUsersPage } from './admin-users-page';

const baseUsers = [
    {
        id: 'finance-id',
        username: 'alex.finance',
        displayName: 'Alex Kim',
        role: 'VIEWER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'sales-id',
        username: 'alex.sales',
        displayName: 'Alex Kim',
        role: 'PUBLISHER',
        mustChangePassword: false,
        active: false,
        createdAt: '2026-08-02T00:00:00.000Z',
    },
];

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const mockApi = (postStatus = 201) => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/admin/users' && !init?.method)
            return response({ users: baseUsers });
        if (input === '/api/admin/users' && init?.method === 'POST') {
            if (postStatus !== 201)
                return response(
                    { error: '이미 존재하는 아이디입니다.' },
                    postStatus
                );
            return response(
                {
                    user: {
                        id: 'viewer-id',
                        username: 'viewer1',
                        displayName: 'Viewer One',
                        role: 'VIEWER',
                        mustChangePassword: true,
                        active: true,
                        createdAt: '2026-08-03T00:00:00.000Z',
                    },
                },
                201
            );
        }
        throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('distinguishes duplicate display names and searches username', async () => {
    mockApi();
    render(<AdminUsersPage />);

    expect(await screen.findAllByText('Alex Kim')).toHaveLength(2);
    expect(screen.getByText('@alex.finance')).toBeVisible();
    expect(screen.getByText('@alex.sales')).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: '사용자 검색' }), {
        target: { value: 'finance' },
    });
    expect(screen.getByText('@alex.finance')).toBeVisible();
    expect(screen.queryByText('@alex.sales')).not.toBeInTheDocument();
});

it('uses a compact responsive row and subdued active status', async () => {
    mockApi();
    render(<AdminUsersPage />);

    const row = (await screen.findByText('@alex.finance')).closest('tr');
    if (!row) throw new Error('User row not found');
    expect(within(row).getByText('역할', { selector: 'span' })).toHaveClass(
        'md:hidden'
    );
    expect(within(row).getByText('상태', { selector: 'span' })).toHaveClass(
        'md:hidden'
    );
    expect(within(row).getByText('활성')).toHaveClass(
        'bg-emerald-500/15',
        'text-emerald-700'
    );
});

it('creates a user in a dialog and adds the returned identity', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(
        await screen.findByRole('button', { name: '사용자 생성' })
    );
    await user.type(screen.getByLabelText('아이디'), 'viewer1');
    await user.type(screen.getByLabelText('표시 이름'), 'Viewer One');
    await user.type(
        screen.getByLabelText('임시 비밀번호'),
        'temporary-password-123'
    );
    await user.click(screen.getByRole('button', { name: '생성' }));

    expect(await screen.findByText('@viewer1')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({ method: 'POST' })
    );
});

it('keeps user creation values when the server rejects them', async () => {
    mockApi(409);
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(
        await screen.findByRole('button', { name: '사용자 생성' })
    );
    await user.type(screen.getByLabelText('아이디'), 'alex.finance');
    await user.type(screen.getByLabelText('표시 이름'), 'Alex Kim');
    await user.type(
        screen.getByLabelText('임시 비밀번호'),
        'temporary-password-123'
    );
    await user.click(screen.getByRole('button', { name: '생성' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
        '이미 존재하는 아이디입니다.'
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    await waitFor(() =>
        expect(screen.getByLabelText('아이디')).toHaveValue('alex.finance')
    );
});
