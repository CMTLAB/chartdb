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
import { apiFetch } from '@/lib/api';

interface TokenItem {
    id: string;
    label: string;
    createdAt: string;
    revokedAt: string | null;
    lastUsedAt: string | null;
}

export const TokensPage = () => {
    const navigate = useNavigate();
    const [tokens, setTokens] = useState<TokenItem[]>([]);
    const [label, setLabel] = useState('');
    const [createdSecret, setCreatedSecret] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const response = await apiFetch<{ tokens: TokenItem[] }>(
                '/api/tokens'
            );
            setTokens(response.tokens);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : '토큰을 불러오지 못했습니다.'
            );
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const response = await apiFetch<{ token: string; item: TokenItem }>(
                '/api/tokens',
                { method: 'POST', body: JSON.stringify({ label }) }
            );
            setCreatedSecret(response.token);
            setTokens((current) => [response.item, ...current]);
            setLabel('');
            setError('');
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '토큰 생성에 실패했습니다.'
            );
        }
    };

    const revoke = async (tokenId: string) => {
        await apiFetch(`/api/tokens/${tokenId}`, { method: 'DELETE' });
        await load();
    };

    return (
        <main className="min-h-screen bg-muted/30 p-4 md:p-8">
            <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex items-center justify-between">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigate('/')}
                    >
                        ChartDB로 돌아가기
                    </Button>
                    <h1 className="text-xl font-semibold">게시 API 토큰</h1>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>새 토큰</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="flex gap-2" onSubmit={create}>
                            <label className="flex-1 space-y-1 text-sm">
                                <span>토큰 이름</span>
                                <Input
                                    value={label}
                                    onChange={(event) =>
                                        setLabel(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            <Button className="self-end">토큰 생성</Button>
                        </form>
                        {createdSecret ? (
                            <div className="mt-4 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
                                <p className="font-medium">
                                    이 값은 지금 한 번만 표시됩니다.
                                </p>
                                <code className="mt-2 block select-all break-all">
                                    {createdSecret}
                                </code>
                            </div>
                        ) : null}
                        {error ? (
                            <p
                                role="alert"
                                className="mt-3 text-sm text-destructive"
                            >
                                {error}
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
                <div className="space-y-3">
                    {tokens.map((token) => (
                        <Card key={token.id}>
                            <CardContent className="flex items-center justify-between gap-3 p-4">
                                <div>
                                    <p className="font-medium">{token.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                        생성{' '}
                                        {new Date(
                                            token.createdAt
                                        ).toLocaleString()}
                                        {token.lastUsedAt
                                            ? ` · 마지막 사용 ${new Date(token.lastUsedAt).toLocaleString()}`
                                            : ''}
                                        {token.revokedAt ? ' · 폐기됨' : ''}
                                    </p>
                                </div>
                                {!token.revokedAt ? (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() => void revoke(token.id)}
                                    >
                                        폐기
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                    {tokens.length === 0 ? (
                        <p className="text-center text-muted-foreground">
                            발급된 토큰이 없습니다.
                        </p>
                    ) : null}
                </div>
            </div>
        </main>
    );
};
