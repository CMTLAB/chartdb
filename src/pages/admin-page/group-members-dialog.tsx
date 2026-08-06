import React, { useMemo, useState } from 'react';

import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
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
import { ScrollArea } from '@/components/scroll-area/scroll-area';
import { apiFetch } from '@/lib/api';

import type { AdminGroup, AdminUser } from './admin-types';

const PAGE_SIZE = 20;

interface GroupMembersDialogProps {
    group: AdminGroup;
    users: AdminUser[];
    onSaved: (group: AdminGroup) => void;
}

export const GroupMembersDialog = ({
    group,
    users,
    onSaved,
}: GroupMembersDialogProps) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [userIds, setUserIds] = useState(new Set(group.userIds));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setDialogOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            setSearch('');
            setPage(1);
            setUserIds(new Set(group.userIds));
            setError('');
        }
    };
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return users.filter((user) =>
            `${user.displayName} ${user.username} ${user.role}`
                .toLocaleLowerCase()
                .includes(query)
        );
    }, [search, users]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visible = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const toggle = (userId: string) => {
        setUserIds((current) => {
            const next = new Set(current);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ group: AdminGroup }>(
                `/api/admin/groups/${group.id}/members`,
                {
                    method: 'PUT',
                    body: JSON.stringify({ userIds: [...userIds] }),
                }
            );
            onSaved(response.group);
            setOpen(false);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : '구성원을 저장하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>구성원 편집</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl" showClose>
                <DialogHeader>
                    <DialogTitle>{group.name} 구성원 편집</DialogTitle>
                    <DialogDescription>
                        체크한 변경은 저장 버튼을 눌러야 반영됩니다.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    type="search"
                    aria-label="구성원 검색"
                    placeholder="표시 이름 또는 아이디 검색"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <ScrollArea className="h-80 rounded-md border">
                    <div className="divide-y">
                        {visible.map((user) => {
                            const selected = userIds.has(user.id);
                            return (
                                <label
                                    key={user.id}
                                    className="flex cursor-pointer items-center gap-3 p-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={!user.active && !selected}
                                        onChange={() => toggle(user.id)}
                                    />
                                    <span>
                                        <span className="font-medium">
                                            {user.displayName}
                                        </span>{' '}
                                        <span className="text-muted-foreground">
                                            @{user.username}
                                        </span>
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className="ml-auto"
                                    >
                                        {user.role}
                                    </Badge>
                                    {!user.active ? (
                                        <Badge variant="outline">비활성</Badge>
                                    ) : null}
                                </label>
                            );
                        })}
                        {visible.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                검색 결과가 없습니다.
                            </p>
                        ) : null}
                    </div>
                </ScrollArea>
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
                                        setPage(
                                            Math.min(pageCount, safePage + 1)
                                        );
                                    }}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                ) : null}
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
                    <Button type="button" disabled={saving} onClick={save}>
                        {saving ? '저장 중…' : '변경사항 저장'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
