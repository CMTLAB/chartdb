import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import { apiFetch } from '@/lib/api';
import { serverDiagramLocalId } from '@/lib/shared-diagram';

interface VersionItem {
    id: string;
    version: number;
    changedBy: { id: string; username: string; displayName: string };
    source: 'WEB' | 'API_TOKEN' | 'RESTORE';
    changeNote: string | null;
    createdAt: string;
}

export const VersionsPage = () => {
    const { diagramId = '' } = useParams<{ diagramId: string }>();
    const navigate = useNavigate();
    const [name, setName] = useState('ERD');
    const [canPublish, setCanPublish] = useState(false);
    const [versions, setVersions] = useState<VersionItem[]>([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const diagram = await apiFetch<{
                name: string;
                canPublish: boolean;
            }>(`/api/diagrams/${diagramId}`);
            const history = await apiFetch<{ versions: VersionItem[] }>(
                `/api/diagrams/${diagramId}/versions`
            );
            setName(diagram.name);
            setCanPublish(diagram.canPublish);
            setVersions(history.versions);
            setError('');
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : '버전 이력을 불러오지 못했습니다.'
            );
        }
    }, [diagramId]);

    useEffect(() => {
        void load();
    }, [load]);

    const download = async (version: number) => {
        const response = await apiFetch<{ diagram: unknown }>(
            `/api/diagrams/${diagramId}/versions/${version}`
        );
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(response.diagram, null, 2)], {
                type: 'application/json',
            })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}-v${version}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const restore = async (version: number) => {
        if (!window.confirm(`버전 ${version}을 새 버전으로 복원할까요?`))
            return;
        await apiFetch(
            `/api/diagrams/${diagramId}/versions/${version}/restore`,
            {
                method: 'POST',
                body: JSON.stringify({}),
            }
        );
        await load();
    };

    return (
        <main className="min-h-screen bg-muted/30 p-4 md:p-8">
            <div className="mx-auto max-w-5xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                            navigate(
                                `/diagrams/${serverDiagramLocalId(diagramId)}`
                            )
                        }
                    >
                        ERD로 돌아가기
                    </Button>
                    <h1 className="text-xl font-semibold">{name} 버전 이력</h1>
                </div>
                {error ? (
                    <p role="alert" className="text-destructive">
                        {error}
                    </p>
                ) : null}
                <div className="space-y-3">
                    {versions.map((version) => (
                        <Card key={version.id}>
                            <CardHeader className="flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle>
                                        버전 {version.version}
                                    </CardTitle>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {new Date(
                                            version.createdAt
                                        ).toLocaleString()}{' '}
                                        · {version.source}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() =>
                                            void download(version.version)
                                        }
                                    >
                                        JSON 다운로드
                                    </Button>
                                    {canPublish ? (
                                        <Button
                                            type="button"
                                            onClick={() =>
                                                void restore(version.version)
                                            }
                                        >
                                            이 버전 복원
                                        </Button>
                                    ) : null}
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm">
                                <p>{version.changedBy.displayName}</p>
                                <p className="text-muted-foreground">
                                    {version.changeNote || '변경 설명 없음'}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                    {!error && versions.length === 0 ? (
                        <p className="text-center text-muted-foreground">
                            버전을 불러오는 중…
                        </p>
                    ) : null}
                </div>
            </div>
        </main>
    );
};
