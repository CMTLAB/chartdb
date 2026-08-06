import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast/use-toast';
import { useAuth } from '@/context/auth-context/auth-context';
import { useStorage } from '@/hooks/use-storage';
import { ApiError, apiFetch } from '@/lib/api';
import { cloneDiagram } from '@/lib/clone';
import type { Diagram } from '@/lib/domain/diagram';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import {
    markServerDiagramVersion,
    parseServerDiagramLocalId,
    serverDiagramLocalId,
} from '@/lib/shared-diagram';

const STRINGS = {
    en: {
        noDiagram: 'No diagram to publish',
        okTitle: 'Published',
        okDesc: 'The new version is available to authorized users.',
        failTitle: (status: number) => `Publish failed (${status})`,
        failNetwork: 'Publish failed',
    },
    ko: {
        noDiagram: '발행할 다이어그램이 없습니다',
        okTitle: '발행 완료',
        okDesc: '권한이 있는 사용자에게 새 버전이 반영되었습니다.',
        failTitle: (status: number) => `발행 실패 (${status})`,
        failNetwork: '발행 실패',
    },
};

interface PublishResponse {
    id: string;
    version: number;
}

export const usePublishDiagram = () => {
    const { toast } = useToast();
    const { i18n } = useTranslation();
    const { user } = useAuth();
    const { addDiagram, deleteDiagram } = useStorage();
    const navigate = useNavigate();

    const publish = useCallback(
        async (diagram: Diagram) => {
            const strings = i18n.language?.startsWith('ko')
                ? STRINGS.ko
                : STRINGS.en;
            if (!diagram?.id || !user) {
                toast({ variant: 'destructive', title: strings.noDiagram });
                return;
            }

            const exported = JSON.parse(diagramToJSONOutput(diagram));
            const serverId = parseServerDiagramLocalId(diagram.id);
            const path = serverId
                ? `/api/diagrams/${serverId}/versions`
                : '/api/diagrams';

            try {
                const response = await apiFetch<PublishResponse>(path, {
                    method: 'POST',
                    body: JSON.stringify({ diagram: exported }),
                });

                if (!serverId) {
                    const localId = serverDiagramLocalId(response.id);
                    const cloned = cloneDiagram(diagram).diagram;
                    await deleteDiagram(localId);
                    await addDiagram({
                        diagram: {
                            ...cloned,
                            id: localId,
                            updatedAt: new Date(),
                        },
                    });
                    await deleteDiagram(diagram.id);
                    navigate(`/diagrams/${localId}`);
                }
                markServerDiagramVersion(
                    user.id,
                    response.id,
                    response.version
                );
                toast({ title: strings.okTitle, description: strings.okDesc });
            } catch (error) {
                toast({
                    variant: 'destructive',
                    title:
                        error instanceof ApiError
                            ? strings.failTitle(error.status)
                            : strings.failNetwork,
                    description:
                        error instanceof Error ? error.message : String(error),
                });
            }
        },
        [toast, i18n, user, addDiagram, deleteDiagram, navigate]
    );

    return { publish };
};
