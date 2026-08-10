import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    getFilterFitDecision,
    useInitialViewportFit,
} from './use-initial-viewport-fit';

describe('getFilterFitDecision', () => {
    it('syncs the filter baseline until the initial viewport is ready', () => {
        expect(getFilterFitDecision(false, true)).toBe('sync');
        expect(getFilterFitDecision(true, true)).toBe('fit');
        expect(getFilterFitDecision(true, false)).toBe('none');
    });
});

describe('useInitialViewportFit', () => {
    it('sets 40% before a diagram id is available', () => {
        const zoomTo = vi.fn();
        const fitView = vi.fn();

        renderHook(() =>
            useInitialViewportFit({
                diagramId: '',
                ready: false,
                zoomTo,
                fitView,
            })
        );

        expect(zoomTo).toHaveBeenCalledWith(0.4, { duration: 0 });
        expect(fitView).not.toHaveBeenCalled();
    });

    it('sets 40% immediately and fits once when the diagram is ready', () => {
        const zoomTo = vi.fn();
        const fitView = vi.fn();
        const initialProps = {
            diagramId: 'diagram-1',
            ready: false,
            zoomTo,
            fitView,
        };
        const { rerender } = renderHook(
            (props: typeof initialProps) => useInitialViewportFit(props),
            { initialProps }
        );

        expect(zoomTo).toHaveBeenCalledWith(0.4, { duration: 0 });
        expect(fitView).not.toHaveBeenCalled();

        rerender({ ...initialProps, ready: true });

        expect(fitView).toHaveBeenCalledOnce();
        expect(fitView).toHaveBeenCalledWith({
            duration: 0,
            padding: 0.1,
            minZoom: 0.4,
            maxZoom: 0.4,
        });

        rerender({ ...initialProps, ready: false });
        rerender({ ...initialProps, ready: true });

        expect(fitView).toHaveBeenCalledOnce();
    });

    it('runs again for a different diagram', () => {
        const zoomTo = vi.fn();
        const fitView = vi.fn();
        const initialProps = {
            diagramId: 'diagram-1',
            ready: true,
            zoomTo,
            fitView,
        };
        const { rerender } = renderHook(
            (props: typeof initialProps) => useInitialViewportFit(props),
            { initialProps }
        );

        rerender({
            ...initialProps,
            diagramId: 'diagram-2',
            ready: false,
        });
        expect(zoomTo).toHaveBeenLastCalledWith(0.4, { duration: 0 });

        rerender({
            ...initialProps,
            diagramId: 'diagram-2',
            ready: true,
        });

        expect(zoomTo).toHaveBeenCalledTimes(2);
        expect(fitView).toHaveBeenCalledTimes(2);
    });
});
