import { createContext, useContext } from 'react';

export type UserRole = 'ADMIN' | 'PUBLISHER' | 'VIEWER';

export interface AuthUser {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    mustChangePassword: boolean;
}

export interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
    changePassword: (
        currentPassword: string,
        newPassword: string
    ) => Promise<void>;
    refresh: () => Promise<void>;
}

export const authContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
    const value = useContext(authContext);
    if (!value) throw new Error('useAuth must be used inside AuthProvider.');
    return value;
};
