import { useEffect, useRef } from 'react';

export const INITIAL_VIEWPORT = { x: 0, y: 0, zoom: 0.4 } as const;
const INITIAL_ZOOM = INITIAL_VIEWPORT.zoom;

export const getFilterFitDecision = (
    initialViewportReady: boolean,
    filterChanged: boolean
): 'sync' | 'fit' | 'none' => {
    if (!initialViewportReady) return 'sync';
    return filterChanged ? 'fit' : 'none';
};

interface UseInitialViewportFitParams {
    diagramId: string;
    ready: boolean;
    zoomTo: (
        zoom: number,
        options?: { duration?: number }
    ) => void | Promise<boolean>;
    fitView: (options?: {
        duration?: number;
        padding?: number;
        minZoom?: number;
        maxZoom?: number;
    }) => void | Promise<boolean>;
}

export const useInitialViewportFit = ({
    diagramId,
    ready,
    zoomTo,
    fitView,
}: UseInitialViewportFitParams): void => {
    const lastFittedDiagramId = useRef<string>();

    useEffect(() => {
        lastFittedDiagramId.current = undefined;
        void zoomTo(INITIAL_ZOOM, { duration: 0 });
    }, [diagramId, zoomTo]);

    useEffect(() => {
        if (!diagramId || !ready || lastFittedDiagramId.current === diagramId) {
            return;
        }

        lastFittedDiagramId.current = diagramId;
        void fitView({
            duration: 0,
            padding: 0.1,
            minZoom: INITIAL_ZOOM,
            maxZoom: INITIAL_ZOOM,
        });
    }, [diagramId, ready, fitView]);
};
