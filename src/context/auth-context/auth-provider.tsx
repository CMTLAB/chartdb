import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthUser } from './auth-context';
import { authContext } from './auth-context';

interface UserResponse {
    user: AuthUser;
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const response = await apiFetch<UserResponse>('/api/auth/me');
            setUser(response.user);
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) {
                console.error(error);
            }
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const login = useCallback(async (username: string, password: string) => {
        const response = await apiFetch<UserResponse>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        setUser(response.user);
        return response.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } finally {
            setUser(null);
        }
    }, []);

    const changePassword = useCallback(
        async (currentPassword: string, newPassword: string) => {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            setUser(null);
        },
        []
    );

    const value = useMemo(
        () => ({ user, loading, login, logout, changePassword, refresh }),
        [user, loading, login, logout, changePassword, refresh]
    );

    return (
        <authContext.Provider value={value}>{children}</authContext.Provider>
    );
};
