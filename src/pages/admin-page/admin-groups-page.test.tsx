import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { AdminGroupsPage } from './admin-groups-page';

const users = [
    {
        id: 'active-id',
        username: 'alex.finance',
        displayName: 'Alex Kim',
        role: 'VIEWER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'inactive-member-id',
        username: 'alex.sales',
        displayName: 'Alex Kim',
        role: 'VIEWER',
        mustChangePassword: false,
        active: false,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'inactive-other-id',
        username: 'inactive.other',
        displayName: 'Inactive Other',
        role: 'VIEWER',
        mustChangePassword: false,
        active: false,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
];

const groups = [
    {
        id: 'finance-id',
        name: 'Finance',
        userIds: ['inactive-member-id'],
        diagramGrantCount: 2,
    },
    {
        id: 'sales-id',
        name: 'Sales',
        userIds: [],
        diagramGrantCount: 0,
    },
];

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const mockApi = (memberStatus = 200) => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/admin/users') return response({ users });
        if (input === '/api/admin/groups' && !init?.method)
            return response({ groups });
        if (input.endsWith('/members') && init?.method === 'PUT') {
            if (memberStatus !== 200)
                return response({ error: '구성원 저장 실패' }, memberStatus);
            return response({
                group: {
                    ...groups[0],
                    userIds: ['inactive-member-id', 'active-id'],
                },
            });
        }
        if (input === '/api/admin/groups' && init?.method === 'POST') {
            return response(
                {
                    group: {
                        id: 'new-id',
                        name: 'Platform',
                        userIds: [],
                        diagramGrantCount: 0,
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

it('shows the selected group member and ERD grant counts', async () => {
    mockApi();
    render(<AdminGroupsPage />);

    expect(
        await screen.findByRole('heading', { name: 'Finance' })
    ).toBeVisible();
    expect(
        screen.getByText((_, element) => element?.textContent === '1명')
    ).toBeVisible();
    expect(
        screen.getByText((_, element) => element?.textContent === '2개')
    ).toBeVisible();
});

it('stages distinguishable members and saves them in one request', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminGroupsPage />);

    await user.click(
        await screen.findByRole('button', { name: '구성원 편집' })
    );
    const activeUser = screen.getByRole('checkbox', {
        name: /Alex Kim @alex\.finance VIEWER/,
    });
    const inactiveMember = screen.getByRole('checkbox', {
        name: /Alex Kim @alex\.sales VIEWER 비활성/,
    });
    const inactiveOther = screen.getByRole('checkbox', {
        name: /Inactive Other @inactive\.other VIEWER 비활성/,
    });
    expect(inactiveMember).toBeChecked();
    expect(inactiveMember).toBeEnabled();
    expect(inactiveOther).toBeDisabled();

    await user.click(activeUser);
    expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
    ).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/groups/finance-id/members',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    userIds: ['inactive-member-id', 'active-id'],
                }),
            })
        )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps the member draft open after a failed save', async () => {
    mockApi(500);
    const user = userEvent.setup();
    render(<AdminGroupsPage />);

    await user.click(
        await screen.findByRole('button', { name: '구성원 편집' })
    );
    const activeUser = screen.getByRole('checkbox', {
        name: /@alex\.finance/,
    });
    await user.click(activeUser);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
        '구성원 저장 실패'
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(activeUser).toBeChecked();
});
