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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/tabs/tabs';
import { apiFetch } from '@/lib/api';

import type { AdminDiagram, AdminGroup, AdminUser } from './admin-types';

const PAGE_SIZE = 20;
type AccessTab = 'publishers' | 'groups' | 'users';

interface DiagramAccessDialogProps {
    diagram: AdminDiagram;
    users: AdminUser[];
    groups: AdminGroup[];
    onSaved: (diagram: AdminDiagram) => void;
}

const Paging = ({
    page,
    total,
    onChange,
}: {
    page: number;
    total: number;
    onChange: (page: number) => void;
}) => {
    if (total <= 1) return null;
    return (
        <Pagination className="pt-3">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        aria-disabled={page === 1}
                        className={
                            page === 1 ? 'pointer-events-none opacity-50' : ''
                        }
                        onClick={(event) => {
                            event.preventDefault();
                            onChange(Math.max(1, page - 1));
                        }}
                    />
                </PaginationItem>
                <PaginationItem className="px-2 text-sm text-muted-foreground">
                    {page} / {total}
                </PaginationItem>
                <PaginationItem>
                    <PaginationNext
                        href="#"
                        aria-disabled={page === total}
                        className={
                            page === total
                                ? 'pointer-events-none opacity-50'
                                : ''
                        }
                        onClick={(event) => {
                            event.preventDefault();
                            onChange(Math.min(total, page + 1));
                        }}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
};

export const DiagramAccessDialog = ({
    diagram,
    users,
    groups,
    onSaved,
}: DiagramAccessDialogProps) => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<AccessTab>('publishers');
    const [searches, setSearches] = useState<Record<AccessTab, string>>({
        publishers: '',
        groups: '',
        users: '',
    });
    const [pages, setPages] = useState<Record<AccessTab, number>>({
        publishers: 1,
        groups: 1,
        users: 1,
    });
    const [publisherIds, setPublisherIds] = useState(
        new Set(diagram.publisherIds)
    );
    const [userGrantIds, setUserGrantIds] = useState(
        new Set(diagram.userGrantIds)
    );
    const [groupGrantIds, setGroupGrantIds] = useState(
        new Set(diagram.groupGrantIds)
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setDialogOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            setTab('publishers');
            setSearches({ publishers: '', groups: '', users: '' });
            setPages({ publishers: 1, groups: 1, users: 1 });
            setPublisherIds(new Set(diagram.publisherIds));
            setUserGrantIds(new Set(diagram.userGrantIds));
            setGroupGrantIds(new Set(diagram.groupGrantIds));
            setError('');
        }
    };

    const candidates = useMemo(() => {
        const query = searches[tab].trim().toLocaleLowerCase();
        if (tab === 'groups') {
            return groups.filter((group) =>
                group.name.toLocaleLowerCase().includes(query)
            );
        }
        return users.filter((user) => {
            if (tab === 'publishers' && user.role !== 'PUBLISHER') return false;
            if (
                tab === 'users' &&
                user.role === 'ADMIN' &&
                !diagram.userGrantIds.includes(user.id)
            )
                return false;
            return `${user.displayName} ${user.username} ${user.role}`
                .toLocaleLowerCase()
                .includes(query);
        });
    }, [diagram.userGrantIds, groups, searches, tab, users]);
    const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
    const page = Math.min(pages[tab], pageCount);
    const visibleCandidates = candidates.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE
    );

    const toggle = (current: Set<string>, id: string) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ diagram: AdminDiagram }>(
                `/api/admin/diagrams/${diagram.id}/access`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        publisherIds: [...publisherIds],
                        userGrantIds: [...userGrantIds],
                        groupGrantIds: [...groupGrantIds],
                    }),
                }
            );
            onSaved(response.diagram);
            setOpen(false);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : '권한을 저장하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>권한 편집</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" showClose>
                <DialogHeader>
                    <DialogTitle>{diagram.name} 권한 편집</DialogTitle>
                    <DialogDescription>
                        체크한 변경은 저장 버튼을 눌러야 반영됩니다.
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as AccessTab)}
                >
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="publishers">
                            공동 게시자
                        </TabsTrigger>
                        <TabsTrigger value="groups">그룹 열람</TabsTrigger>
                        <TabsTrigger value="users">직접 열람</TabsTrigger>
                    </TabsList>
                    {(['publishers', 'groups', 'users'] as const).map(
                        (value) => (
                            <TabsContent key={value} value={value}>
                                <Input
                                    type="search"
                                    aria-label={
                                        value === 'groups'
                                            ? '그룹 검색'
                                            : '사용자 검색'
                                    }
                                    placeholder="이름 또는 아이디 검색"
                                    value={searches[value]}
                                    onChange={(event) => {
                                        setSearches((current) => ({
                                            ...current,
                                            [value]: event.target.value,
                                        }));
                                        setPages((current) => ({
                                            ...current,
                                            [value]: 1,
                                        }));
                                    }}
                                />
                                <ScrollArea className="mt-3 h-72 rounded-md border">
                                    <div className="divide-y">
                                        {visibleCandidates.map((candidate) => {
                                            if ('userIds' in candidate) {
                                                const checked =
                                                    groupGrantIds.has(
                                                        candidate.id
                                                    );
                                                return (
                                                    <label
                                                        key={candidate.id}
                                                        className="flex cursor-pointer items-center gap-3 p-3 text-sm"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() =>
                                                                setGroupGrantIds(
                                                                    (current) =>
                                                                        toggle(
                                                                            current,
                                                                            candidate.id
                                                                        )
                                                                )
                                                            }
                                                        />
                                                        <span className="font-medium">
                                                            {candidate.name}
                                                        </span>
                                                        <span className="ml-auto text-muted-foreground">
                                                            {
                                                                candidate
                                                                    .userIds
                                                                    .length
                                                            }
                                                            명
                                                        </span>
                                                    </label>
                                                );
                                            }
                                            const selected =
                                                value === 'publishers'
                                                    ? publisherIds.has(
                                                          candidate.id
                                                      )
                                                    : userGrantIds.has(
                                                          candidate.id
                                                      );
                                            return (
                                                <label
                                                    key={candidate.id}
                                                    className="flex cursor-pointer items-center gap-3 p-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        disabled={
                                                            !candidate.active &&
                                                            !selected
                                                        }
                                                        onChange={() => {
                                                            if (
                                                                value ===
                                                                'publishers'
                                                            ) {
                                                                setPublisherIds(
                                                                    (current) =>
                                                                        toggle(
                                                                            current,
                                                                            candidate.id
                                                                        )
                                                                );
                                                            } else {
                                                                setUserGrantIds(
                                                                    (current) =>
                                                                        toggle(
                                                                            current,
                                                                            candidate.id
                                                                        )
                                                                );
                                                            }
                                                        }}
                                                    />
                                                    <span>
                                                        <span className="font-medium">
                                                            {
                                                                candidate.displayName
                                                            }
                                                        </span>{' '}
                                                        <span className="text-muted-foreground">
                                                            @
                                                            {candidate.username}
                                                        </span>
                                                    </span>
                                                    <Badge
                                                        variant="secondary"
                                                        className="ml-auto"
                                                    >
                                                        {candidate.role}
                                                    </Badge>
                                                    {!candidate.active ? (
                                                        <Badge variant="outline">
                                                            비활성
                                                        </Badge>
                                                    ) : null}
                                                </label>
                                            );
                                        })}
                                        {visibleCandidates.length === 0 ? (
                                            <p className="p-6 text-center text-sm text-muted-foreground">
                                                검색 결과가 없습니다.
                                            </p>
                                        ) : null}
                                    </div>
                                </ScrollArea>
                                <Paging
                                    page={page}
                                    total={pageCount}
                                    onChange={(nextPage) =>
                                        setPages((current) => ({
                                            ...current,
                                            [value]: nextPage,
                                        }))
                                    }
                                />
                            </TabsContent>
                        )
                    )}
                </Tabs>

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
