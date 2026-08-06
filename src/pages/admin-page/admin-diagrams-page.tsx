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
} from '@/components/alert-dialog/alert-dialog';
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
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/pagination/pagination';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { AdminDiagram, AdminGroup, AdminUser } from './admin-types';
import { DiagramAccessDialog } from './diagram-access-dialog';

const PAGE_SIZE = 20;
type DiagramState = 'all' | 'active' | 'archived';

export const AdminDiagramsPage = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [groups, setGroups] = useState<AdminGroup[]>([]);
    const [diagrams, setDiagrams] = useState<AdminDiagram[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [search, setSearch] = useState('');
    const [state, setState] = useState<DiagramState>('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [archiveTarget, setArchiveTarget] = useState<AdminDiagram | null>(
        null
    );
    const [changingId, setChangingId] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([
            apiFetch<{ users: AdminUser[] }>('/api/admin/users'),
            apiFetch<{ groups: AdminGroup[] }>('/api/admin/groups'),
            apiFetch<{ diagrams: AdminDiagram[] }>('/api/admin/diagrams'),
        ])
            .then(([userResponse, groupResponse, diagramResponse]) => {
                if (!active) return;
                setUsers(userResponse.users);
                setGroups(groupResponse.groups);
                setDiagrams(diagramResponse.diagrams);
                setSelectedId(diagramResponse.diagrams[0]?.id ?? '');
            })
            .catch((loadError: unknown) => {
                if (!active) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : 'ERD 목록을 불러오지 못했습니다.'
                );
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return diagrams.filter((diagram) => {
            const matchesState =
                state === 'all' ||
                (state === 'archived' ? diagram.archived : !diagram.archived);
            const matchesSearch =
                `${diagram.name} ${diagram.createdByUsername} ${diagram.id.slice(0, 8)}`
                    .toLocaleLowerCase()
                    .includes(query);
            return matchesState && matchesSearch;
        });
    }, [diagrams, search, state]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visible = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );
    const selected =
        filtered.find((diagram) => diagram.id === selectedId) ??
        visible[0] ??
        null;

    const updateDiagram = (updated: AdminDiagram) => {
        setDiagrams((current) =>
            current.map((diagram) =>
                diagram.id === updated.id ? updated : diagram
            )
        );
    };

    const setArchived = async (diagram: AdminDiagram) => {
        setChangingId(diagram.id);
        try {
            await apiFetch(
                `/api/admin/diagrams/${diagram.id}/${diagram.archived ? 'unarchive' : 'archive'}`,
                { method: 'POST' }
            );
            updateDiagram({ ...diagram, archived: !diagram.archived });
            setError('');
        } catch (archiveError) {
            setError(
                archiveError instanceof Error
                    ? archiveError.message
                    : 'ERD 상태를 변경하지 못했습니다.'
            );
        } finally {
            setChangingId('');
        }
    };

    if (loading) {
        return <p className="py-12 text-center">ERD 목록을 불러오는 중…</p>;
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">ERD 관리</h2>
                <p className="text-sm text-muted-foreground">
                    ERD를 선택한 뒤 게시자와 열람 권한을 관리합니다.
                </p>
            </div>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Input
                    type="search"
                    role="searchbox"
                    aria-label="ERD 검색"
                    placeholder="ERD 이름, 생성자, 짧은 ID 검색"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <select
                    aria-label="ERD 상태"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={state}
                    onChange={(event) => {
                        setState(event.target.value as DiagramState);
                        setPage(1);
                    }}
                >
                    <option value="all">전체 상태</option>
                    <option value="active">사용 중</option>
                    <option value="archived">보관됨</option>
                </select>
            </div>

            <p className="text-sm text-muted-foreground">
                {filtered.length}개의 ERD
            </p>

            <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)]">
                <Card>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {visible.map((diagram) => (
                                <button
                                    key={diagram.id}
                                    type="button"
                                    aria-label={`${diagram.name} @${diagram.createdByUsername} #${diagram.id.slice(0, 8)} 선택`}
                                    className={cn(
                                        'w-full p-4 text-left transition-colors hover:bg-muted/60',
                                        selected?.id === diagram.id &&
                                            'bg-muted'
                                    )}
                                    onClick={() => setSelectedId(diagram.id)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">
                                                {diagram.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                @{diagram.createdByUsername} · #
                                                {diagram.id.slice(0, 8)}
                                            </p>
                                        </div>
                                        {diagram.archived ? (
                                            <Badge variant="secondary">
                                                보관됨
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        게시자 {diagram.publisherCount} · 직접
                                        열람 {diagram.userGrantCount} · 그룹{' '}
                                        {diagram.groupGrantCount}
                                    </p>
                                </button>
                            ))}
                            {visible.length === 0 ? (
                                <p className="p-8 text-center text-sm text-muted-foreground">
                                    조건에 맞는 ERD가 없습니다.
                                </p>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                {selected ? (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle>{selected.name}</CardTitle>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        @{selected.createdByUsername} · #
                                        {selected.id.slice(0, 8)}
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        selected.archived
                                            ? 'secondary'
                                            : 'default'
                                    }
                                >
                                    {selected.archived ? '보관됨' : '사용 중'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <dl className="grid grid-cols-3 gap-3 text-center text-sm">
                                <div className="rounded-md border p-3">
                                    <dt className="text-muted-foreground">
                                        공동 게시자
                                    </dt>
                                    <dd className="text-lg font-semibold">
                                        {selected.publisherCount}
                                    </dd>
                                </div>
                                <div className="rounded-md border p-3">
                                    <dt className="text-muted-foreground">
                                        직접 열람
                                    </dt>
                                    <dd className="text-lg font-semibold">
                                        {selected.userGrantCount}
                                    </dd>
                                </div>
                                <div className="rounded-md border p-3">
                                    <dt className="text-muted-foreground">
                                        그룹 열람
                                    </dt>
                                    <dd className="text-lg font-semibold">
                                        {selected.groupGrantCount}
                                    </dd>
                                </div>
                            </dl>
                            <p className="text-sm text-muted-foreground">
                                생성:{' '}
                                {new Date(selected.createdAt).toLocaleString(
                                    'ko-KR'
                                )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <DiagramAccessDialog
                                    diagram={selected}
                                    users={users}
                                    groups={groups}
                                    onSaved={updateDiagram}
                                />
                                {selected.archived ? (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={changingId === selected.id}
                                        onClick={() =>
                                            void setArchived(selected)
                                        }
                                    >
                                        {changingId === selected.id
                                            ? '복구 중…'
                                            : '복구'}
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() =>
                                            setArchiveTarget(selected)
                                        }
                                    >
                                        보관
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>

            <AlertDialog
                open={Boolean(archiveTarget)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !changingId) setArchiveTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {archiveTarget?.name} ERD를 보관할까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            일반 사용자의 접근이 중단됩니다.
                            {archiveTarget ? (
                                <span className="mt-1 block">
                                    @{archiveTarget.createdByUsername} · #
                                    {archiveTarget.id.slice(0, 8)}
                                </span>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={Boolean(changingId)}>
                            취소
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={Boolean(changingId)}
                            onClick={(event) => {
                                event.preventDefault();
                                if (!archiveTarget) return;
                                void setArchived(archiveTarget).finally(() =>
                                    setArchiveTarget(null)
                                );
                            }}
                        >
                            {changingId ? '보관 중…' : 'ERD 보관'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                        {Array.from(
                            { length: pageCount },
                            (_, index) => index + 1
                        ).map((number) => (
                            <PaginationItem key={number}>
                                <PaginationLink
                                    href="#"
                                    isActive={number === safePage}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        setPage(number);
                                    }}
                                >
                                    {number}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
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
