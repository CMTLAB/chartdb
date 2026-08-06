import type { UserRole } from '@/context/auth-context/auth-context';

export interface AdminUser {
    id: string;
    username: string;
    displayName: string;
    department: string | null;
    role: UserRole;
    mustChangePassword: boolean;
    active: boolean;
    createdAt: string;
}

export interface AdminGroup {
    id: string;
    name: string;
    userIds: string[];
    diagramGrantCount: number;
}

export interface AdminDiagram {
    id: string;
    name: string;
    archived: boolean;
    createdByUsername: string;
    createdAt: string;
    publisherIds: string[];
    userGrantIds: string[];
    groupGrantIds: string[];
    publisherCount: number;
    userGrantCount: number;
    groupGrantCount: number;
}
