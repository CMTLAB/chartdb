import React, { useCallback, useEffect, useMemo, useState } from 'react';

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
import { apiFetch } from '@/lib/api';

interface AdminToken {
    id: string;
    label: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    lastUsedAt: string | null;
    owner: {
        id: string;
        username: string;
        displayName: string;
        department: string | null;
        active: boolean;
    };
}

type TokenStatus = 'active' | 'revoked' | 'expired';
type StatusFilter = 'all' | TokenStatus;

const PAGE_SIZE = 20;
const tokenStatus = (token: AdminToken): TokenStatus =>
    token.revokedAt
        ? 'revoked'
        : token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()
          ? 'expired'
          : 'active';
const statusLabel: Record<TokenStatus, string> = {
    active: '활성',
    revoked: '폐기됨',
    expired: '만료됨',
};
const formatDate = (value: string | null, empty: string) =>
    value ? new Date(value).toLocaleString('ko-KR') : empty;

export const AdminTokensPage = () => {
    const [tokens, setTokens] = useState<AdminToken[]>([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revokeTarget, setRevokeTarget] = useState<AdminToken | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [revokeError, setRevokeError] = useState('');

    const load = useCallback(async () => {
        const response = await apiFetch<{ tokens: AdminToken[] }>(
            '/api/admin/tokens'
        );
        setTokens(response.tokens);
        setError('');
    }, []);

    useEffect(() => {
        let mounted = true;
        void load()
            .catch((loadError: unknown) => {
                if (!mounted) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : '토큰 목록을 불러오지 못했습니다.'
                );
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [load]);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return tokens.filter((token) => {
            const matchesSearch =
                `${token.label} ${token.owner.displayName} ${token.owner.username} ${token.owner.department ?? ''}`
                    .toLocaleLowerCase()
                    .includes(query);
            return (
                matchesSearch &&
                (status === 'all' || tokenStatus(token) === status)
            );
        });
    }, [search, status, tokens]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visible = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const revoke = async () => {
        if (!revokeTarget) return;
        setRevoking(true);
        setRevokeError('');
        try {
            await apiFetch(`/api/admin/tokens/${revokeTarget.id}`, {
                method: 'DELETE',
            });
            await load();
            setRevokeTarget(null);
        } catch (revokeFailure) {
            setRevokeError(
                revokeFailure instanceof Error
                    ? revokeFailure.message
                    : '토큰을 폐기하지 못했습니다.'
            );
        } finally {
            setRevoking(false);
        }
    };

    if (loading) {
        return <p className="py-12 text-center">토큰을 불러오는 중…</p>;
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">토큰 관리</h2>
                <p className="text-sm text-muted-foreground">
                    게시 API 토큰의 소유자와 사용 상태를 확인하고 폐기합니다.
                </p>
            </div>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Input
                    type="search"
                    role="searchbox"
                    aria-label="토큰 검색"
                    placeholder="토큰 이름, 사용자 또는 부서 검색"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <select
                    aria-label="토큰 상태 필터"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value as StatusFilter);
                        setPage(1);
                    }}
                >
                    <option value="all">전체 상태</option>
                    <option value="active">활성</option>
                    <option value="revoked">폐기됨</option>
                    <option value="expired">만료됨</option>
                </select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        토큰 {filtered.length}개
                    </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                    <Table className="block md:table md:min-w-[900px] md:table-fixed">
                        <TableHeader className="hidden md:table-header-group">
                            <TableRow>
                                <TableHead className="w-1/5">토큰</TableHead>
                                <TableHead className="w-1/4">소유자</TableHead>
                                <TableHead className="w-[12%]">상태</TableHead>
                                <TableHead className="w-[28%]">날짜</TableHead>
                                <TableHead className="w-[15%] text-right">
                                    관리
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="block md:table-row-group">
                            {visible.map((token) => {
                                const currentStatus = tokenStatus(token);
                                return (
                                    <TableRow
                                        key={token.id}
                                        className="block space-y-3 p-4 md:table-row md:space-y-0 md:p-0"
                                    >
                                        <TableCell className="block p-0 font-medium md:table-cell md:w-1/5 md:p-3">
                                            {token.label}
                                        </TableCell>
                                        <TableCell className="flex items-start justify-between gap-3 p-0 md:table-cell md:w-1/4 md:p-3">
                                            <span className="text-xs font-medium text-muted-foreground md:hidden">
                                                소유자
                                            </span>
                                            <div className="text-right md:text-left">
                                                <p>{token.owner.displayName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    @{token.owner.username}
                                                </p>
                                                {token.owner.department ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        {token.owner.department}
                                                    </p>
                                                ) : null}
                                                {!token.owner.active ? (
                                                    <Badge
                                                        variant="secondary"
                                                        className="mt-1"
                                                    >
                                                        비활성 계정
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="flex items-center justify-between gap-3 p-0 md:table-cell md:w-[12%] md:p-3">
                                            <span className="text-xs font-medium text-muted-foreground md:hidden">
                                                상태
                                            </span>
                                            <Badge
                                                variant={
                                                    currentStatus === 'active'
                                                        ? 'outline'
                                                        : 'secondary'
                                                }
                                                className={
                                                    currentStatus === 'active'
                                                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                        : undefined
                                                }
                                            >
                                                {statusLabel[currentStatus]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="flex items-start justify-between gap-3 p-0 text-xs text-muted-foreground md:table-cell md:w-[28%] md:p-3">
                                            <span className="font-medium md:hidden">
                                                날짜
                                            </span>
                                            <div className="text-right md:text-left">
                                                <p>
                                                    생성{' '}
                                                    {formatDate(
                                                        token.createdAt,
                                                        '-'
                                                    )}
                                                </p>
                                                <p>
                                                    마지막 사용{' '}
                                                    {formatDate(
                                                        token.lastUsedAt,
                                                        '사용 기록 없음'
                                                    )}
                                                </p>
                                                <p>
                                                    만료{' '}
                                                    {formatDate(
                                                        token.expiresAt,
                                                        '없음'
                                                    )}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="flex items-center justify-between gap-3 p-0 md:table-cell md:w-[15%] md:p-3 md:text-right">
                                            <span className="text-xs font-medium text-muted-foreground md:hidden">
                                                관리
                                            </span>
                                            {currentStatus === 'active' ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => {
                                                        setRevokeError('');
                                                        setRevokeTarget(token);
                                                    }}
                                                >
                                                    폐기
                                                </Button>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {visible.length === 0 ? (
                                <TableRow className="block md:table-row">
                                    <TableCell
                                        colSpan={5}
                                        className="block h-24 text-center text-muted-foreground md:table-cell"
                                    >
                                        조건에 맞는 토큰이 없습니다.
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

            <AlertDialog
                open={revokeTarget !== null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !revoking) {
                        setRevokeTarget(null);
                        setRevokeError('');
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {revokeTarget?.label} 토큰을 폐기할까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            @{revokeTarget?.owner.username} 사용자의 토큰입니다.
                            폐기하면 즉시 사용할 수 없으며 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {revokeError ? (
                        <p role="alert" className="text-sm text-destructive">
                            {revokeError}
                        </p>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>
                            취소
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={revoking}
                            onClick={(event) => {
                                event.preventDefault();
                                void revoke();
                            }}
                        >
                            {revoking ? '폐기 중…' : '토큰 폐기'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
