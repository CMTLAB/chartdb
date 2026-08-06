import React, { useEffect, useMemo, useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/alert-dialog/alert-dialog';
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
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { AdminGroup, AdminUser } from './admin-types';
import { GroupMembersDialog } from './group-members-dialog';

const PAGE_SIZE = 20;

const GroupCreateDialog = ({
    onCreated,
}: {
    onCreated: (group: AdminGroup) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setDialogOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            setName('');
            setError('');
        }
    };
    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ group: AdminGroup }>(
                '/api/admin/groups',
                { method: 'POST', body: JSON.stringify({ name }) }
            );
            onCreated(response.group);
            setOpen(false);
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '그룹을 생성하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>그룹 생성</Button>
            </DialogTrigger>
            <DialogContent showClose>
                <form className="space-y-4" onSubmit={create}>
                    <DialogHeader>
                        <DialogTitle>그룹 생성</DialogTitle>
                        <DialogDescription>
                            그룹 이름은 대소문자 구분 없이 중복될 수 없습니다.
                        </DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-1 text-sm">
                        <span>그룹 이름</span>
                        <Input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                        />
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

export const AdminGroupsPage = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [groups, setGroups] = useState<AdminGroup[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;
        void Promise.all([
            apiFetch<{ users: AdminUser[] }>('/api/admin/users'),
            apiFetch<{ groups: AdminGroup[] }>('/api/admin/groups'),
        ])
            .then(([userResponse, groupResponse]) => {
                if (!mounted) return;
                setUsers(userResponse.users);
                setGroups(groupResponse.groups);
                setSelectedId(groupResponse.groups[0]?.id ?? '');
            })
            .catch((loadError: unknown) => {
                if (!mounted) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : '그룹 목록을 불러오지 못했습니다.'
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
        return groups.filter((group) =>
            group.name.toLocaleLowerCase().includes(query)
        );
    }, [groups, search]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visible = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );
    const selected =
        filtered.find((group) => group.id === selectedId) ?? visible[0] ?? null;

    const updateGroup = (updated: AdminGroup) => {
        setGroups((current) =>
            current.map((group) => (group.id === updated.id ? updated : group))
        );
    };
    const deleteGroup = async (group: AdminGroup) => {
        try {
            await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'DELETE',
            });
            setGroups((current) =>
                current.filter((item) => item.id !== group.id)
            );
            setSelectedId('');
            setError('');
        } catch (deleteError) {
            setError(
                deleteError instanceof Error
                    ? deleteError.message
                    : '그룹을 삭제하지 못했습니다.'
            );
        }
    };

    if (loading) {
        return <p className="py-12 text-center">그룹을 불러오는 중…</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold">그룹 관리</h2>
                    <p className="text-sm text-muted-foreground">
                        그룹을 선택한 뒤 구성원을 일괄 편집합니다.
                    </p>
                </div>
                <GroupCreateDialog
                    onCreated={(created) => {
                        setGroups((current) => [...current, created]);
                        setSelectedId(created.id);
                    }}
                />
            </div>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            <Input
                type="search"
                role="searchbox"
                aria-label="그룹 검색"
                placeholder="그룹 이름 검색"
                value={search}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                }}
            />
            <p className="text-sm text-muted-foreground">
                {filtered.length}개의 그룹
            </p>

            <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(360px,1.2fr)]">
                <Card>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {visible.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    className={cn(
                                        'w-full p-4 text-left transition-colors hover:bg-muted/60',
                                        selected?.id === group.id && 'bg-muted'
                                    )}
                                    onClick={() => setSelectedId(group.id)}
                                >
                                    <p className="font-medium">{group.name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        구성원 {group.userIds.length}명 · 열람
                                        ERD {group.diagramGrantCount}개
                                    </p>
                                </button>
                            ))}
                            {visible.length === 0 ? (
                                <p className="p-8 text-center text-sm text-muted-foreground">
                                    조건에 맞는 그룹이 없습니다.
                                </p>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                {selected ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>{selected.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-md border p-4">
                                    <p className="text-sm text-muted-foreground">
                                        구성원
                                    </p>
                                    <p className="text-xl font-semibold">
                                        {selected.userIds.length}명
                                    </p>
                                </div>
                                <div className="rounded-md border p-4">
                                    <p className="text-sm text-muted-foreground">
                                        열람 ERD
                                    </p>
                                    <p className="text-xl font-semibold">
                                        {selected.diagramGrantCount}개
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <GroupMembersDialog
                                    group={selected}
                                    users={users}
                                    onSaved={updateGroup}
                                />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive">
                                            그룹 삭제
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                {selected.name} 그룹을
                                                삭제할까요?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                구성원 연결과 ERD 그룹 권한이
                                                함께 제거됩니다.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>
                                                취소
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() =>
                                                    void deleteGroup(selected)
                                                }
                                            >
                                                삭제
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>

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
