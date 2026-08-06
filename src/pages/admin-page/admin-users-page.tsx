import React, { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
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
import { UserCreateDialog } from './user-create-dialog';
import { UserEditDialog } from './user-edit-dialog';

const PAGE_SIZE = 20;
type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'ALL' | UserRole;

export const AdminUsersPage = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [search, setSearch] = useState('');
    const [role, setRole] = useState<RoleFilter>('ALL');
    const [active, setActive] = useState<ActiveFilter>('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

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
            const matchesSearch =
                `${user.displayName} ${user.username} ${user.department ?? ''}`
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
                    placeholder="표시 이름, 아이디 또는 부서 검색"
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
                    <Table className="block md:min-w-[760px]">
                        <TableHeader className="hidden md:block">
                            <TableRow className="grid grid-cols-[minmax(220px,1fr)_120px_90px_120px_64px] items-center gap-4 px-6">
                                <TableHead className="px-0">사용자</TableHead>
                                <TableHead className="px-0">역할</TableHead>
                                <TableHead className="px-0">상태</TableHead>
                                <TableHead className="px-0">생성일</TableHead>
                                <TableHead className="px-0 text-right">
                                    관리
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="block">
                            {visible.map((user) => (
                                <TableRow
                                    key={user.id}
                                    className="block space-y-3 px-6 py-4 md:grid md:grid-cols-[minmax(220px,1fr)_120px_90px_120px_64px] md:items-center md:gap-4 md:space-y-0"
                                >
                                    <TableCell className="block p-0">
                                        <div className="flex flex-wrap items-start gap-2">
                                            <button
                                                type="button"
                                                aria-label={`${user.displayName} @${user.username} 사용자 수정`}
                                                className="min-w-0 text-left hover:underline"
                                                onClick={() =>
                                                    setEditingUser(user)
                                                }
                                            >
                                                <span className="block font-medium">
                                                    {user.displayName}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    @{user.username}
                                                </span>
                                                {user.department ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {user.department}
                                                    </span>
                                                ) : null}
                                            </button>
                                            {user.mustChangePassword ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                >
                                                    비밀번호 변경 대기
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell className="flex items-center justify-between gap-3 p-0 md:block">
                                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                                            역할
                                        </span>
                                        <Badge variant="outline">
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="flex items-center justify-between gap-3 p-0 md:block">
                                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                                            상태
                                        </span>
                                        <Badge
                                            variant={
                                                user.active
                                                    ? 'outline'
                                                    : 'secondary'
                                            }
                                            className={
                                                user.active
                                                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                    : undefined
                                            }
                                        >
                                            {user.active ? '활성' : '비활성'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="flex items-center justify-between gap-3 p-0 text-muted-foreground md:block">
                                        <span className="text-xs font-medium md:hidden">
                                            생성일
                                        </span>
                                        <span>
                                            {new Date(
                                                user.createdAt
                                            ).toLocaleDateString('ko-KR')}
                                        </span>
                                    </TableCell>
                                    <TableCell className="flex items-center justify-between gap-3 p-0 md:flex md:justify-end">
                                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                                            관리
                                        </span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            aria-label={`${user.username} 수정`}
                                            onClick={() => setEditingUser(user)}
                                        >
                                            수정
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {visible.length === 0 ? (
                                <TableRow className="block md:table-row">
                                    <TableCell
                                        colSpan={5}
                                        className="block h-24 text-center text-muted-foreground md:table-cell"
                                    >
                                        조건에 맞는 사용자가 없습니다.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {editingUser ? (
                <UserEditDialog
                    key={editingUser.id}
                    user={editingUser}
                    onUpdated={(updated) => {
                        setUsers((current) =>
                            current.map((user) =>
                                user.id === updated.id ? updated : user
                            )
                        );
                        setEditingUser(null);
                        setError('');
                    }}
                    onClose={() => setEditingUser(null)}
                />
            ) : null}

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
