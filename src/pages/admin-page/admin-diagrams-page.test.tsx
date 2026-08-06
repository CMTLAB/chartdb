import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { AdminDiagramsPage } from './admin-diagrams-page';
import type { AdminDiagram, AdminUser } from './admin-types';
import { DiagramAccessDialog } from './diagram-access-dialog';

const users: AdminUser[] = [
    {
        id: 'publisher-id',
        username: 'alice',
        displayName: 'Alice Park',
        role: 'PUBLISHER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'viewer-id',
        username: 'alex.finance',
        displayName: 'Alex Kim',
        role: 'VIEWER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'inactive-id',
        username: 'alex.sales',
        displayName: 'Alex Kim',
        role: 'VIEWER',
        mustChangePassword: false,
        active: false,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'admin-id',
        username: 'admin',
        displayName: 'Administrator',
        role: 'ADMIN',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
];

const diagrams: AdminDiagram[] = [
    {
        id: 'abcdef12-0000-0000-0000-000000000000',
        name: 'Orders',
        archived: false,
        createdByUsername: 'alice',
        createdAt: '2026-08-01T00:00:00.000Z',
        publisherIds: ['publisher-id'],
        userGrantIds: ['inactive-id'],
        groupGrantIds: [],
        publisherCount: 1,
        userGrantCount: 1,
        groupGrantCount: 0,
    },
    {
        id: '98765432-0000-0000-0000-000000000000',
        name: 'Orders',
        archived: true,
        createdByUsername: 'bob',
        createdAt: '2026-08-02T00:00:00.000Z',
        publisherIds: [],
        userGrantIds: [],
        groupGrantIds: [],
        publisherCount: 0,
        userGrantCount: 0,
        groupGrantCount: 0,
    },
];

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const mockApi = (accessStatus = 200) => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/admin/users') return response({ users });
        if (input === '/api/admin/groups')
            return response({
                groups: [
                    {
                        id: 'group-id',
                        name: 'Finance',
                        userIds: [],
                        diagramGrantCount: 0,
                    },
                ],
            });
        if (input === '/api/admin/diagrams') return response({ diagrams });
        if (input.endsWith('/access') && init?.method === 'PUT') {
            if (accessStatus !== 200)
                return response({ error: '저장 실패' }, accessStatus);
            return response({
                diagram: {
                    ...diagrams[0],
                    userGrantIds: ['inactive-id', 'viewer-id'],
                    userGrantCount: 2,
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

it('disambiguates duplicate ERD names and searches by creator or short id', async () => {
    mockApi();
    render(<AdminDiagramsPage />);

    expect((await screen.findAllByText('@alice · #abcdef12'))[0]).toBeVisible();
    expect(screen.getAllByText('@bob · #98765432')[0]).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: 'ERD 검색' }), {
        target: { value: 'bob' },
    });
    expect(screen.queryAllByText('@alice · #abcdef12')).toHaveLength(0);
    expect(screen.getAllByText('@bob · #98765432')[0]).toBeVisible();
});

it('stages distinguishable access selections and sends one batch request on save', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminDiagramsPage />);

    await user.click(await screen.findByRole('button', { name: '권한 편집' }));
    await user.click(screen.getByRole('tab', { name: '직접 열람' }));

    const activeViewer = screen.getByRole('checkbox', {
        name: /Alex Kim @alex\.finance VIEWER/,
    });
    const inactiveViewer = screen.getByRole('checkbox', {
        name: /Alex Kim @alex\.sales VIEWER 비활성/,
    });
    expect(inactiveViewer).toBeChecked();
    expect(inactiveViewer).toBeEnabled();
    expect(
        screen.queryByRole('checkbox', { name: /Administrator/ })
    ).not.toBeInTheDocument();

    await user.click(activeViewer);
    expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
    ).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/diagrams/abcdef12-0000-0000-0000-000000000000/access',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    publisherIds: ['publisher-id'],
                    userGrantIds: ['inactive-id', 'viewer-id'],
                    groupGrantIds: [],
                }),
            })
        )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps the access draft open when saving fails', async () => {
    mockApi(500);
    const user = userEvent.setup();
    render(<AdminDiagramsPage />);

    await user.click(await screen.findByRole('button', { name: '권한 편집' }));
    await user.click(screen.getByRole('tab', { name: '직접 열람' }));
    const activeViewer = screen.getByRole('checkbox', {
        name: /@alex\.finance/,
    });
    await user.click(activeViewer);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('저장 실패');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(activeViewer).toBeChecked();
});

it('shows an existing redundant admin grant so it can be removed', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(
        <DiagramAccessDialog
            diagram={{
                ...diagrams[0],
                userGrantIds: ['admin-id'],
                userGrantCount: 1,
            }}
            users={users}
            groups={[]}
            onSaved={vi.fn()}
        />
    );

    await user.click(screen.getByRole('button', { name: '권한 편집' }));
    await user.click(screen.getByRole('tab', { name: '직접 열람' }));
    const adminGrant = screen.getByRole('checkbox', {
        name: /Administrator @admin ADMIN/,
    });
    expect(adminGrant).toBeChecked();
    await user.click(adminGrant);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    await waitFor(() => {
        const putCall = fetchMock.mock.calls.find(
            ([, init]) => init?.method === 'PUT'
        );
        expect(putCall?.[1]?.body).toBe(
            JSON.stringify({
                publisherIds: ['publisher-id'],
                userGrantIds: [],
                groupGrantIds: [],
            })
        );
    });
});
