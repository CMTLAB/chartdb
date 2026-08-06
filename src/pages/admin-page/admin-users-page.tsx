import React, { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/pagination/pagination';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/table/table';
import type { UserRole } from '@/context/auth-context/auth-context';
import { apiFetch } from '@/lib/api';

import type { AdminUser } from './admin-types';

const PAGE_SIZE = 20;
type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'ALL' | UserRole;

const UserCreateDialog = ({
    onCreated,
}: {
    onCreated: (user: AdminUser) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [temporaryPassword, setTemporaryPassword] = useState('');
    const [role, setRole] = useState<UserRole>('VIEWER');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setDialogOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            setUsername('');
            setDisplayName('');
            setTemporaryPassword('');
            setRole('VIEWER');
            setError('');
        }
    };

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ user: AdminUser }>(
                '/api/admin/users',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        username,
                        displayName,
                        temporaryPassword,
                        role,
                    }),
                }
            );
            onCreated(response.user);
            setOpen(false);
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '사용자를 생성하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>사용자 생성</Button>
            </DialogTrigger>
            <DialogContent showClose>
                <form className="space-y-4" onSubmit={create}>
                    <DialogHeader>
                        <DialogTitle>사용자 생성</DialogTitle>
                        <DialogDescription>
                            아이디는 중복될 수 없으며 첫 로그인 때 비밀번호를
                            변경해야 합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-1 text-sm">
                        <span>아이디</span>
                        <Input
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            required
                        />
                    </label>
                    <label className="block space-y-1 text-sm">
                        <span>표시 이름</span>
                        <Input
                            value={displayName}
                            onChange={(event) =>
                                setDisplayName(event.target.value)
                            }
                            required
                        />
                    </label>
                    <label className="block space-y-1 text-sm">
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
                    <label className="block space-y-1 text-sm">
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
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                취소
                            </Button>
                        </DialogClose>
                        <Button disabled={saving}>
                            {saving ? '생성 중…' : '생성'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export const AdminUsersPage = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [search, setSearch] = useState('');
    const [role, setRole] = useState<RoleFilter>('ALL');
    const [active, setActive] = useState<ActiveFilter>('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;
        void apiFetch<{ users: AdminUser[] }>('/api/admin/users')
            .then((response) => {
                if (mounted) setUsers(response.users);
            })
            .catch((loadError: unknown) => {
                if (!mounted) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : '사용자 목록을 불러오지 못했습니다.'
                );
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return users.filter((user) => {
            const matchesSearch = `${user.displayName} ${user.username}`
                .toLocaleLowerCase()
                .includes(query);
            const matchesRole = role === 'ALL' || user.role === role;
            const matchesActive =
                active === 'all' ||
                (active === 'active' ? user.active : !user.active);
            return matchesSearch && matchesRole && matchesActive;
        });
    }, [active, role, search, users]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visible = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

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
            setError('');
        } catch (updateError) {
            setError(
                updateError instanceof Error
                    ? updateError.message
                    : '사용자를 변경하지 못했습니다.'
            );
        }
    };

    if (loading) {
        return <p className="py-12 text-center">사용자를 불러오는 중…</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold">사용자 관리</h2>
                    <p className="text-sm text-muted-foreground">
                        표시 이름이 같아도 고유 아이디로 구분됩니다.
                    </p>
                </div>
                <UserCreateDialog
                    onCreated={(created) =>
                        setUsers((current) => [...current, created])
                    }
                />
            </div>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                <Input
                    type="search"
                    role="searchbox"
                    aria-label="사용자 검색"
                    placeholder="표시 이름 또는 아이디 검색"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <select
                    aria-label="역할 필터"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={role}
                    onChange={(event) => {
                        setRole(event.target.value as RoleFilter);
                        setPage(1);
                    }}
                >
                    <option value="ALL">전체 역할</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="PUBLISHER">PUBLISHER</option>
                    <option value="VIEWER">VIEWER</option>
                </select>
                <select
                    aria-label="상태 필터"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={active}
                    onChange={(event) => {
                        setActive(event.target.value as ActiveFilter);
                        setPage(1);
                    }}
                >
                    <option value="all">전체 상태</option>
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                </select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        사용자 {filtered.length}명
                    </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>사용자</TableHead>
                                <TableHead>역할</TableHead>
                                <TableHead>상태</TableHead>
                                <TableHead>생성일</TableHead>
                                <TableHead className="text-right">
                                    관리
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <p className="font-medium">
                                            {user.displayName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            @{user.username}
                                        </p>
                                        {user.mustChangePassword ? (
                                            <Badge
                                                variant="outline"
                                                className="mt-1"
                                            >
                                                비밀번호 변경 대기
                                            </Badge>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <select
                                            aria-label={`${user.username} 역할`}
                                            className="h-8 rounded-md border bg-background px-2 text-sm"
                                            value={user.role}
                                            onChange={(event) =>
                                                void updateUser(user.id, {
                                                    role: event.target
                                                        .value as UserRole,
                                                })
                                            }
                                        >
                                            <option value="ADMIN">ADMIN</option>
                                            <option value="PUBLISHER">
                                                PUBLISHER
                                            </option>
                                            <option value="VIEWER">
                                                VIEWER
                                            </option>
                                        </select>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                user.active
                                                    ? 'default'
                                                    : 'secondary'
                                            }
                                        >
                                            {user.active ? '활성' : '비활성'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {new Date(
                                            user.createdAt
                                        ).toLocaleDateString('ko-KR')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() =>
                                                void updateUser(user.id, {
                                                    active: !user.active,
                                                })
                                            }
                                        >
                                            {user.active
                                                ? '비활성화'
                                                : '활성화'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {visible.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        조건에 맞는 사용자가 없습니다.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {pageCount > 1 ? (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                aria-disabled={safePage === 1}
                                className={
                                    safePage === 1
                                        ? 'pointer-events-none opacity-50'
                                        : ''
                                }
                                onClick={(event) => {
                                    event.preventDefault();
                                    setPage(Math.max(1, safePage - 1));
                                }}
                            />
                        </PaginationItem>
                        <PaginationItem className="px-2 text-sm text-muted-foreground">
                            {safePage} / {pageCount}
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                aria-disabled={safePage === pageCount}
                                className={
                                    safePage === pageCount
                                        ? 'pointer-events-none opacity-50'
                                        : ''
                                }
                                onClick={(event) => {
                                    event.preventDefault();
                                    setPage(Math.min(pageCount, safePage + 1));
                                }}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            ) : null}
        </div>
    );
};
