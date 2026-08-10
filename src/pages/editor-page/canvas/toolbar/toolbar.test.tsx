import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './toolbar';

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({
        fitView: vi.fn(),
        getZoom: () => 1,
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
    }),
    useOnViewportChange: vi.fn(),
    useViewport: () => ({ x: 0, y: 0, zoom: 0.4 }),
}));

vi.mock('@/hooks/use-history', () => ({
    useHistory: () => ({
        redo: vi.fn(),
        undo: vi.fn(),
        hasRedo: false,
        hasUndo: false,
    }),
}));

vi.mock('@/hooks/use-canvas', () => ({
    useCanvas: () => ({
        reorderTables: vi.fn(),
        setShowFilter: vi.fn(),
    }),
}));

vi.mock('@/context/diagram-filter-context/use-diagram-filter', () => ({
    useDiagramFilter: () => ({ hasActiveFilter: false }),
}));

vi.mock('@/context/alert-context/alert-context', () => ({
    useAlert: () => ({ showAlert: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/tooltip/tooltip', () => ({
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
    TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
    TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('Toolbar zoom display', () => {
    it('renders the current viewport zoom instead of the stale initial value', () => {
        render(<Toolbar readonly />);

        expect(screen.getByRole('button', { name: '40%' })).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: '100%' })
        ).not.toBeInTheDocument();
    });
});
