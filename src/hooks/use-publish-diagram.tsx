import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast/use-toast';
import { useStorage } from '@/hooks/use-storage';
import { cloneDiagram } from '@/lib/clone';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import { markSharedSeeded, sharedDiagramId } from '@/lib/shared-diagram';
import type { Diagram } from '@/lib/domain/diagram';

// Publishes the current diagram to the shared team ERD via the publish sidecar
// (reverse-proxied at /publish). The token is requested for every publish.
//
// This feature keeps its own en/ko strings instead of the shared i18n dictionary:
// LanguageTranslation is `typeof en`, so adding keys there would force all ~22
// locale files to define them. Other languages fall back to English here.
const LEGACY_TOKEN_KEY = 'chartdb:publishToken';

const STRINGS = {
    en: {
        noDiagram: 'No diagram to publish',
        tokenPrompt: 'Publish token (PUBLISH_TOKEN)',
        okTitle: 'Published',
        okDesc: 'Teammates will see this ERD after they reload.',
        failTitle: (s: number) => `Publish failed (${s})`,
        failNetwork: 'Publish failed',
    },
    ko: {
        noDiagram: '발행할 다이어그램이 없습니다',
        tokenPrompt: '발행 토큰 (PUBLISH_TOKEN)',
        okTitle: '발행 완료',
        okDesc: '팀원이 새로고침하면 이 ERD가 보입니다.',
        failTitle: (s: number) => `발행 실패 (${s})`,
        failNetwork: '발행 실패',
    },
};

export const usePublishDiagram = () => {
    const { toast } = useToast();
    const { i18n } = useTranslation();
    const { addDiagram, deleteDiagram } = useStorage();
    const navigate = useNavigate();

    const publish = useCallback(
        async (diagram: Diagram) => {
            const s = i18n.language?.startsWith('ko') ? STRINGS.ko : STRINGS.en;

            if (!diagram?.id) {
                toast({ variant: 'destructive', title: s.noDiagram });
                return;
            }

            localStorage.removeItem(LEGACY_TOKEN_KEY);
            const token = (window.prompt(s.tokenPrompt) ?? '').trim();
            if (!token) {
                return;
            }

            const text = diagramToJSONOutput(diagram);

            try {
                const res = await fetch('/publish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-publish-token': token,
                    },
                    body: text,
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const slug: string | undefined = data.slug;
                    // The server already has it; adopting the shared copy locally is
                    // best-effort — never turn a failure here into "publish failed".
                    try {
                        if (slug) {
                            markSharedSeeded(slug, text);
                            const sharedId = sharedDiagramId(slug);
                            // Adopt the shared copy so the author keeps a single diagram
                            // (the shared one), not the original + a seeded duplicate.
                            if (diagram.id !== sharedId) {
                                const cloned = cloneDiagram(diagram).diagram;
                                // Replace any prior shared copy (cascades to its tables,
                                // no-op if absent) and regenerate ids so nothing collides
                                // with the original still in the id-keyed stores.
                                await deleteDiagram(sharedId);
                                await addDiagram({
                                    diagram: {
                                        ...cloned,
                                        id: sharedId,
                                        updatedAt: new Date(),
                                    },
                                });
                                await deleteDiagram(diagram.id);
                                navigate(`/diagrams/${sharedId}`);
                            }
                        }
                    } catch {
                        // published fine; leave the local copies as-is
                    }
                    toast({ title: s.okTitle, description: s.okDesc });
                    return;
                }

                const data = await res.json().catch(() => ({}));
                toast({
                    variant: 'destructive',
                    title: s.failTitle(res.status),
                    description: data.error ?? '',
                });
            } catch (e) {
                toast({
                    variant: 'destructive',
                    title: s.failNetwork,
                    description: e instanceof Error ? e.message : String(e),
                });
            }
        },
        [toast, i18n, addDiagram, deleteDiagram, navigate]
    );

    return { publish };
};
