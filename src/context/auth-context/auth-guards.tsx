import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Spinner } from '@/components/spinner/spinner';
import { useAuth } from './auth-context';

export const RequireAuth = () => {
    const { loading, user } = useAuth();
    const location = useLocation();
    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center">
                <Spinner size="large" />
            </main>
        );
    }
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return <Outlet />;
};

export const RequirePasswordChanged = () => {
    const { user } = useAuth();
    return user?.mustChangePassword ? (
        <Navigate to="/change-password" replace />
    ) : (
        <Outlet />
    );
};

export const RequireAdmin = () => {
    const { user } = useAuth();
    return user?.role === 'ADMIN' ? <Outlet /> : <Navigate to="/" replace />;
};

export const RequirePublisher = () => {
    const { user } = useAuth();
    return user?.role === 'PUBLISHER' ? (
        <Outlet />
    ) : (
        <Navigate to="/" replace />
    );
};
