import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { AdminPage } from './admin-page';

const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('creates a viewer and adds it to the visible user list', async () => {
    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response({ users: [] }))
        .mockResolvedValueOnce(response({ groups: [] }))
        .mockResolvedValueOnce(response({ diagrams: [] }))
        .mockResolvedValueOnce(
            response(
                {
                    user: {
                        id: 'viewer-id',
                        username: 'viewer1',
                        displayName: 'Viewer One',
                        role: 'VIEWER',
                        mustChangePassword: true,
                        active: true,
                        createdAt: '2026-08-04T00:00:00.000Z',
                    },
                },
                201
            )
        );
    vi.stubGlobal('fetch', fetchMock);
    render(
        <MemoryRouter>
            <AdminPage />
        </MemoryRouter>
    );
    await screen.findByText('등록된 사용자가 없습니다.');

    fireEvent.change(screen.getByLabelText('아이디'), {
        target: { value: 'viewer1' },
    });
    fireEvent.change(screen.getByLabelText('표시 이름'), {
        target: { value: 'Viewer One' },
    });
    fireEvent.change(screen.getByLabelText('임시 비밀번호'), {
        target: { value: 'temporary-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '사용자 생성' }));

    expect(await screen.findByText('viewer1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/users',
        expect.objectContaining({ method: 'POST' })
    );
});
