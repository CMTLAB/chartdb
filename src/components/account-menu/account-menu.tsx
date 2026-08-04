import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/button/button';
import { useAuth } from '@/context/auth-context/auth-context';

export const AccountMenu = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    if (!user) return null;

    return (
        <div className="flex items-center gap-1 text-xs">
            <span className="hidden max-w-32 truncate text-muted-foreground lg:inline">
                {user.displayName}
            </span>
            {user.role === 'ADMIN' ? (
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('/admin')}
                >
                    관리
                </Button>
            ) : null}
            {user.role === 'PUBLISHER' ? (
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('/tokens')}
                >
                    API 토큰
                </Button>
            ) : null}
            <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={async () => {
                    await logout();
                    navigate('/login', { replace: true });
                }}
            >
                로그아웃
            </Button>
        </div>
    );
};
