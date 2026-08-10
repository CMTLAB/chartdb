import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorPage } from './editor-page';

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({
        diagramName: 'Internal schema',
        currentDiagram: { id: 'diagram-1' },
    }),
}));
vi.mock('@/hooks/use-breakpoint', () => ({
    useBreakpoint: () => ({ isMd: true }),
}));
vi.mock('./use-diagram-loader', () => ({
    useDiagramLoader: () => ({ initialDiagram: undefined }),
}));
vi.mock('@/context/auth-context/auth-context', () => ({
    useAuth: () => ({ user: { role: 'EDITOR' } }),
}));
vi.mock('@/components/toast/toaster', () => ({ Toaster: () => null }));
vi.mock('react-helmet-async', () => ({
    Helmet: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('@xyflow/react', () => ({
    ReactFlowProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('./editor-desktop-layout', () => ({
    default: () => <main>Desktop editor</main>,
}));
vi.mock('./editor-mobile-layout', () => ({
    default: () => <main>Mobile editor</main>,
}));

vi.mock(
    '@/context/full-screen-spinner-context/full-screen-spinner-provider',
    () => ({
        FullScreenLoaderProvider: ({ children }: React.PropsWithChildren) =>
            children,
    })
);
vi.mock('@/context/layout-context/layout-provider', () => ({
    LayoutProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/storage-context/storage-provider', () => ({
    StorageProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/config-context/config-provider', () => ({
    ConfigProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/history-context/redo-undo-stack-provider', () => ({
    RedoUndoStackProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/chartdb-context/chartdb-provider', () => ({
    ChartDBProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/history-context/history-provider', () => ({
    HistoryProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/export-image-context/export-image-provider', () => ({
    ExportImageProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/dialog-context/dialog-provider', () => ({
    DialogProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock(
    '@/context/keyboard-shortcuts-context/keyboard-shortcuts-provider',
    () => ({
        KeyboardShortcutsProvider: ({ children }: React.PropsWithChildren) =>
            children,
    })
);
vi.mock('@/context/alert-context/alert-provider', () => ({
    AlertProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/canvas-context/canvas-provider', () => ({
    CanvasProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/diff-context/diff-provider', () => ({
    DiffProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/context/diagram-filter-context/diagram-filter-provider', () => ({
    DiagramFilterProvider: ({ children }: React.PropsWithChildren) => children,
}));

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

it('does not interrupt editor usage with an automatic GitHub star prompt', async () => {
    render(<EditorPage />);

    await act(async () => Promise.resolve());

    expect(vi.getTimerCount()).toBe(0);
});
