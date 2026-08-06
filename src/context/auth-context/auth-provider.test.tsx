import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { storageDatabaseName } from '@/context/storage-context/storage-database';
import { useAuth } from './auth-context';
import { AuthProvider } from './auth-provider';

const AuthProbe = () => {
    const { loading, user, login } = useAuth();
    if (loading) return <span>loading</span>;
    return (
        <button type="button" onClick={() => login('admin', 'password')}>
            {user?.username ?? 'signed-out'}
        </button>
    );
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
    it('exposes a signed-out state when the current session is unauthorized', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Authentication required.' }),
            })
        );

        render(
            <AuthProvider>
                <AuthProbe />
            </AuthProvider>
        );

        expect(await screen.findByText('signed-out')).toBeInTheDocument();
    });

    it('stores the user returned by login', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Authentication required.' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    user: {
                        id: 'admin-id',
                        username: 'admin',
                        displayName: 'Administrator',
                        role: 'ADMIN',
                        mustChangePassword: false,
                    },
                }),
            });
        vi.stubGlobal('fetch', fetchMock);
        render(
            <AuthProvider>
                <AuthProbe />
            </AuthProvider>
        );
        const button = await screen.findByText('signed-out');

        await act(async () => button.click());

        expect(await screen.findByText('admin')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenLastCalledWith(
            '/api/auth/login',
            expect.objectContaining({
                method: 'POST',
                credentials: 'same-origin',
            })
        );
    });
});

describe('storageDatabaseName', () => {
    it('uses the stable authenticated user id', () => {
        expect(storageDatabaseName('user-123')).toBe('ChartDB:user-123');
    });
});
