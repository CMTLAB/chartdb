import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import { Input } from '@/components/input/input';
import type { UserRole } from '@/context/auth-context/auth-context';
import { apiFetch } from '@/lib/api';

interface AdminUser {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    mustChangePassword: boolean;
    active: boolean;
    createdAt: string;
}

interface AdminGroup {
    id: string;
    name: string;
    userIds: string[];
}

interface AdminDiagram {
    id: string;
    name: string;
    archived: boolean;
    publisherIds: string[];
    userGrantIds: string[];
    groupGrantIds: string[];
}

export const AdminPage = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [groups, setGroups] = useState<AdminGroup[]>([]);
    const [diagrams, setDiagrams] = useState<AdminDiagram[]>([]);
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [temporaryPassword, setTemporaryPassword] = useState('');
    const [role, setRole] = useState<UserRole>('VIEWER');
    const [groupName, setGroupName] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const [userResponse, groupResponse, diagramResponse] =
                await Promise.all([
                    apiFetch<{ users: AdminUser[] }>('/api/admin/users'),
                    apiFetch<{ groups: AdminGroup[] }>('/api/admin/groups'),
                    apiFetch<{ diagrams: AdminDiagram[] }>(
                        '/api/admin/diagrams'
                    ),
                ]);
            setUsers(userResponse.users);
            setGroups(groupResponse.groups);
            setDiagrams(diagramResponse.diagrams);
            setError('');
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : '관리 정보를 불러오지 못했습니다.'
            );
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const createUser = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const response = await apiFetch<{ user: AdminUser }>(
                '/api/admin/users',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        username,
                        displayName,
                        role,
                        temporaryPassword,
                    }),
                }
            );
            setUsers((current) => [...current, response.user]);
            setUsername('');
            setDisplayName('');
            setTemporaryPassword('');
            setError('');
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '사용자를 생성하지 못했습니다.'
            );
        }
    };

    const updateUser = async (
        userId: string,
        update: { active?: boolean; role?: UserRole }
    ) => {
        try {
            const response = await apiFetch<{ user: AdminUser }>(
                `/api/admin/users/${userId}`,
                { method: 'PATCH', body: JSON.stringify(update) }
            );
            setUsers((current) =>
                current.map((user) =>
                    user.id === userId ? response.user : user
                )
            );
        } catch (updateError) {
            setError(
                updateError instanceof Error
                    ? updateError.message
                    : '사용자를 변경하지 못했습니다.'
            );
        }
    };

    const createGroup = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const response = await apiFetch<{ group: AdminGroup }>(
                '/api/admin/groups',
                { method: 'POST', body: JSON.stringify({ name: groupName }) }
            );
            setGroups((current) => [...current, response.group]);
            setGroupName('');
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '그룹을 생성하지 못했습니다.'
            );
        }
    };

    const changeAssociation = async (path: string, checked: boolean) => {
        try {
            await apiFetch(path, { method: checked ? 'PUT' : 'DELETE' });
            await load();
        } catch (associationError) {
            setError(
                associationError instanceof Error
                    ? associationError.message
                    : '권한을 변경하지 못했습니다.'
            );
        }
    };

    const setArchived = async (diagram: AdminDiagram) => {
        try {
            await apiFetch(
                `/api/admin/diagrams/${diagram.id}/${diagram.archived ? 'unarchive' : 'archive'}`,
                { method: 'POST' }
            );
            setDiagrams((current) =>
                current.map((item) =>
                    item.id === diagram.id
                        ? { ...item, archived: !item.archived }
                        : item
                )
            );
        } catch (archiveError) {
            setError(
                archiveError instanceof Error
                    ? archiveError.message
                    : 'ERD 상태를 변경하지 못했습니다.'
            );
        }
    };

    return (
        <main className="min-h-screen bg-muted/30 p-4 md:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex items-center justify-between">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigate('/')}
                    >
                        ChartDB로 돌아가기
                    </Button>
                    <h1 className="text-2xl font-semibold">접근 권한 관리</h1>
                </header>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>사용자</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <form
                            className="grid gap-3 md:grid-cols-5"
                            onSubmit={createUser}
                        >
                            <label className="space-y-1 text-sm">
                                <span>아이디</span>
                                <Input
                                    value={username}
                                    onChange={(event) =>
                                        setUsername(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span>표시 이름</span>
                                <Input
                                    value={displayName}
                                    onChange={(event) =>
                                        setDisplayName(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span>임시 비밀번호</span>
                                <Input
                                    type="password"
                                    minLength={12}
                                    value={temporaryPassword}
                                    onChange={(event) =>
                                        setTemporaryPassword(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span>역할</span>
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-3"
                                    value={role}
                                    onChange={(event) =>
                                        setRole(event.target.value as UserRole)
                                    }
                                >
                                    <option value="VIEWER">VIEWER</option>
                                    <option value="PUBLISHER">PUBLISHER</option>
                                    <option value="ADMIN">ADMIN</option>
                                </select>
                            </label>
                            <Button className="self-end">사용자 생성</Button>
                        </form>
                        <div className="divide-y rounded-md border">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex flex-wrap items-center gap-3 p-3 text-sm"
                                >
                                    <div className="min-w-40 flex-1">
                                        <p className="font-medium">
                                            {user.username}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {user.displayName}
                                            {user.mustChangePassword
                                                ? ' · 비밀번호 변경 대기'
                                                : ''}
                                        </p>
                                    </div>
                                    <select
                                        aria-label={`${user.username} 역할`}
                                        className="h-8 rounded-md border bg-background px-2"
                                        value={user.role}
                                        onChange={(event) =>
                                            void updateUser(user.id, {
                                                role: event.target
                                                    .value as UserRole,
                                            })
                                        }
                                    >
                                        <option value="VIEWER">VIEWER</option>
                                        <option value="PUBLISHER">
                                            PUBLISHER
                                        </option>
                                        <option value="ADMIN">ADMIN</option>
                                    </select>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            user.active
                                                ? 'secondary'
                                                : 'default'
                                        }
                                        onClick={() =>
                                            void updateUser(user.id, {
                                                active: !user.active,
                                            })
                                        }
                                    >
                                        {user.active ? '비활성화' : '활성화'}
                                    </Button>
                                </div>
                            ))}
                            {users.length === 0 ? (
                                <p className="p-4 text-center text-muted-foreground">
                                    등록된 사용자가 없습니다.
                                </p>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>그룹과 구성원</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <form className="flex gap-2" onSubmit={createGroup}>
                            <label className="flex-1 space-y-1 text-sm">
                                <span>그룹 이름</span>
                                <Input
                                    value={groupName}
                                    onChange={(event) =>
                                        setGroupName(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            <Button className="self-end">그룹 생성</Button>
                        </form>
                        <div className="grid gap-3 md:grid-cols-2">
                            {groups.map((group) => (
                                <Card key={group.id}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">
                                            {group.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {users.map((user) => (
                                            <label
                                                key={user.id}
                                                className="flex items-center gap-2 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={group.userIds.includes(
                                                        user.id
                                                    )}
                                                    onChange={(event) =>
                                                        void changeAssociation(
                                                            `/api/admin/groups/${group.id}/users/${user.id}`,
                                                            event.target.checked
                                                        )
                                                    }
                                                />
                                                {user.username}
                                            </label>
                                        ))}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>ERD별 권한</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {diagrams.map((diagram) => (
                            <Card
                                key={diagram.id}
                                className={diagram.archived ? 'opacity-60' : ''}
                            >
                                <CardHeader className="flex-row items-center justify-between space-y-0">
                                    <CardTitle className="text-base">
                                        {diagram.name}
                                        {diagram.archived ? ' · 보관됨' : ''}
                                    </CardTitle>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            void setArchived(diagram)
                                        }
                                    >
                                        {diagram.archived ? '복구' : '보관'}
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-3">
                                    <section>
                                        <h3 className="mb-2 text-sm font-semibold">
                                            공동 게시자
                                        </h3>
                                        {users
                                            .filter(
                                                (user) =>
                                                    user.role === 'PUBLISHER' &&
                                                    user.active
                                            )
                                            .map((user) => (
                                                <label
                                                    key={user.id}
                                                    className="flex items-center gap-2 text-sm"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={diagram.publisherIds.includes(
                                                            user.id
                                                        )}
                                                        onChange={(event) =>
                                                            void changeAssociation(
                                                                `/api/admin/diagrams/${diagram.id}/publishers/${user.id}`,
                                                                event.target
                                                                    .checked
                                                            )
                                                        }
                                                    />
                                                    {user.username}
                                                </label>
                                            ))}
                                    </section>
                                    <section>
                                        <h3 className="mb-2 text-sm font-semibold">
                                            사용자 직접 열람
                                        </h3>
                                        {users
                                            .filter((user) => user.active)
                                            .map((user) => (
                                                <label
                                                    key={user.id}
                                                    className="flex items-center gap-2 text-sm"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={diagram.userGrantIds.includes(
                                                            user.id
                                                        )}
                                                        onChange={(event) =>
                                                            void changeAssociation(
                                                                `/api/admin/diagrams/${diagram.id}/user-grants/${user.id}`,
                                                                event.target
                                                                    .checked
                                                            )
                                                        }
                                                    />
                                                    {user.username}
                                                </label>
                                            ))}
                                    </section>
                                    <section>
                                        <h3 className="mb-2 text-sm font-semibold">
                                            그룹 열람
                                        </h3>
                                        {groups.map((group) => (
                                            <label
                                                key={group.id}
                                                className="flex items-center gap-2 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={diagram.groupGrantIds.includes(
                                                        group.id
                                                    )}
                                                    onChange={(event) =>
                                                        void changeAssociation(
                                                            `/api/admin/diagrams/${diagram.id}/group-grants/${group.id}`,
                                                            event.target.checked
                                                        )
                                                    }
                                                />
                                                {group.name}
                                            </label>
                                        ))}
                                    </section>
                                </CardContent>
                            </Card>
                        ))}
                        {diagrams.length === 0 ? (
                            <p className="text-center text-muted-foreground">
                                게시된 ERD가 없습니다.
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </main>
    );
};
