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
        department: null,
        role: 'PUBLISHER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'viewer-id',
        username: 'alex.finance',
        displayName: 'Alex Kim',
        department: null,
        role: 'VIEWER',
        mustChangePassword: false,
        active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'inactive-id',
        username: 'alex.sales',
        displayName: 'Alex Kim',
        department: null,
        role: 'VIEWER',
        mustChangePassword: false,
        active: false,
        createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
        id: 'admin-id',
        username: 'admin',
        displayName: 'Administrator',
        department: null,
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

const mockApi = (
    accessStatus = 200,
    pendingAccess?: Promise<ReturnType<typeof response>>
) => {
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
            if (pendingAccess) return pendingAccess;
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
        if (
            (input.endsWith('/archive') || input.endsWith('/unarchive')) &&
            init?.method === 'POST'
        )
            return response({ ok: true });
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

    const activeViewer = screen.getByRole('button', {
        name: 'Alex Kim @alex.finance 추가',
    });
    const inactiveViewer = screen.getByRole('button', {
        name: 'Alex Kim @alex.sales 제거',
    });
    expect(inactiveViewer).toBeEnabled();
    expect(
        screen.queryByRole('button', { name: /Administrator/ })
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
    const activeViewer = screen.getByRole('button', {
        name: 'Alex Kim @alex.finance 추가',
    });
    await user.click(activeViewer);
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('저장 실패');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(
        screen.getByRole('button', {
            name: 'Alex Kim @alex.finance 제거',
        })
    ).toBeEnabled();
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
    const adminGrant = screen.getByRole('button', {
        name: 'Administrator @admin 제거',
    });
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

it('asks before discarding a changed access draft', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AdminDiagramsPage />);

    await user.click(await screen.findByRole('button', { name: '권한 편집' }));
    await user.click(screen.getByRole('tab', { name: '직접 열람' }));
    await user.click(
        screen.getByRole('button', { name: 'Alex Kim @alex.finance 추가' })
    );
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(
        screen.getByRole('alertdialog', {
            name: '저장하지 않은 변경사항을 버릴까요?',
        })
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(
        screen.getByRole('button', {
            name: 'Alex Kim @alex.finance 제거',
        })
    ).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '취소' }));
    await user.click(screen.getByRole('button', { name: '변경사항 버리기' }));
    expect(
        screen.queryByRole('heading', { name: 'Orders 권한 편집' })
    ).not.toBeInTheDocument();
});

it('locks access controls while a save is in progress', async () => {
    let resolveAccess!: (value: ReturnType<typeof response>) => void;
    const pendingAccess = new Promise<ReturnType<typeof response>>(
        (resolve) => {
            resolveAccess = resolve;
        }
    );
    mockApi(200, pendingAccess);
    const user = userEvent.setup();
    render(<AdminDiagramsPage />);

    await user.click(await screen.findByRole('button', { name: '권한 편집' }));
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: '공동 게시자' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    resolveAccess(response({ diagram: diagrams[0] }));
    await waitFor(() =>
        expect(
            screen.queryByRole('heading', { name: 'Orders 권한 편집' })
        ).not.toBeInTheDocument()
    );
});

it('confirms archive impact but recovers an ERD immediately', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<AdminDiagramsPage />);

    await user.click(await screen.findByRole('button', { name: '보관' }));
    expect(
        fetchMock.mock.calls.some(([input]) => input.endsWith('/archive'))
    ).toBe(false);
    expect(
        screen.getByRole('alertdialog', {
            name: 'Orders ERD를 보관할까요?',
        })
    ).toBeVisible();
    expect(screen.getByText('일반 사용자의 접근이 중단됩니다.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'ERD 보관' }));
    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/diagrams/abcdef12-0000-0000-0000-000000000000/archive',
            expect.objectContaining({ method: 'POST' })
        )
    );

    await user.click(await screen.findByRole('button', { name: '복구' }));
    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/admin/diagrams/abcdef12-0000-0000-0000-000000000000/unarchive',
            expect.objectContaining({ method: 'POST' })
        )
    );
});
