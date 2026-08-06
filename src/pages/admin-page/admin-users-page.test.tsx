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
        department: 'Accounting',
        role: 'VIEWER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'sales-id',
        username: 'alex.sales',
        displayName: 'Alex Kim',
        department: 'Revenue',
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

const mockApi = (postStatus = 201, patchStatus = 200) => {
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
                        department: 'Finance',
                        role: 'VIEWER',
                        mustChangePassword: true,
                        active: true,
                        createdAt: '2026-08-03T00:00:00.000Z',
                    },
                },
                201
            );
        }
        if (
            input === '/api/admin/users/finance-id' &&
            init?.method === 'PATCH'
        ) {
            const update = JSON.parse(String(init.body));
            if (patchStatus !== 200)
                return response(
                    { error: '사용자를 변경하지 못했습니다.' },
                    patchStatus
                );
            return response({
                user: {
                    ...baseUsers[0],
                    ...update,
                    department: update.department || null,
                    mustChangePassword: Boolean(update.temporaryPassword),
                },
            });
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

    fireEvent.change(screen.getByRole('searchbox', { name: '사용자 검색' }), {
        target: { value: 'Revenue' },
    });
    expect(screen.queryByText('@alex.finance')).not.toBeInTheDocument();
    expect(screen.getByText('@alex.sales')).toBeVisible();
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
    expect(row).toHaveClass(
        'px-6',
        'md:grid',
        'md:grid-cols-[minmax(220px,1fr)_120px_90px_120px_64px]'
    );
    const headerRow = screen
        .getByRole('columnheader', { name: '사용자' })
        .closest('tr');
    expect(headerRow).toHaveClass(
        'px-6',
        'grid-cols-[minmax(220px,1fr)_120px_90px_120px_64px]'
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
    await user.type(screen.getByLabelText('부서명'), 'Finance');
    await user.click(
        screen.getByRole('button', { name: '임시 비밀번호 생성' })
    );
    const temporaryPassword = screen.getByLabelText('임시 비밀번호');
    expect((temporaryPassword as HTMLInputElement).value).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: '생성' }));

    expect(await screen.findByText('@viewer1')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                username: 'viewer1',
                displayName: 'Viewer One',
                department: 'Finance',
                temporaryPassword: (temporaryPassword as HTMLInputElement)
                    .value,
                role: 'VIEWER',
            }),
        })
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

it('stages user changes in a dialog and applies them only on save', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(
        await screen.findByRole('button', {
            name: 'Alex Kim @alex.finance 사용자 수정',
        })
    );
    const dialog = screen.getByRole('dialog', { name: '사용자 수정' });
    expect(
        within(dialog).queryByLabelText('임시 비밀번호')
    ).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('표시 이름'));
    await user.type(within(dialog).getByLabelText('표시 이름'), 'Alex Park');
    await user.clear(within(dialog).getByLabelText('부서명'));
    await user.type(within(dialog).getByLabelText('부서명'), 'Platform');
    await user.selectOptions(
        within(dialog).getByLabelText('역할'),
        'PUBLISHER'
    );
    await user.selectOptions(
        within(dialog).getByLabelText('계정 상태'),
        'inactive'
    );

    expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')
    ).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: '저장' }));

    expect(await screen.findByText('Alex Park')).toBeVisible();
    expect(screen.getByText('Platform')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/finance-id',
        expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
                displayName: 'Alex Park',
                department: 'Platform',
                role: 'PUBLISHER',
                active: false,
            }),
        })
    );
    expect(screen.queryByText('비밀번호 변경 대기')).not.toBeInTheDocument();
});

it('includes a generated temporary password only when resetting it', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await user.click(
        await screen.findByRole('button', {
            name: 'Alex Kim @alex.finance 사용자 수정',
        })
    );
    const dialog = screen.getByRole('dialog', { name: '사용자 수정' });
    expect(within(dialog).queryByLabelText('임시 비밀번호')).toBeNull();
    await user.click(
        within(dialog).getByRole('button', {
            name: '임시 비밀번호 생성',
        })
    );
    const passwordField = within(dialog).getByLabelText('임시 비밀번호');
    expect(passwordField).toHaveAttribute('readonly');
    const password = (passwordField as HTMLInputElement).value;
    expect(password).toHaveLength(20);
    await user.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/users/finance-id',
            expect.objectContaining({ body: expect.stringContaining(password) })
        )
    );
    expect(await screen.findByText('비밀번호 변경 대기')).toBeVisible();
});

it('keeps user edit values when save fails', async () => {
    mockApi(201, 500);
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await user.click(
        await screen.findByRole('button', {
            name: 'Alex Kim @alex.finance 사용자 수정',
        })
    );
    const dialog = screen.getByRole('dialog', { name: '사용자 수정' });
    await user.clear(within(dialog).getByLabelText('부서명'));
    await user.type(within(dialog).getByLabelText('부서명'), 'Security');
    await user.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        '사용자를 변경하지 못했습니다.'
    );
    expect(within(dialog).getByLabelText('부서명')).toHaveValue('Security');
});
