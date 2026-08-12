import React from 'react';
import { render, screen } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import { expect, it, vi } from 'vitest';
import type { DBTable } from '@/lib/domain/db-table';
import { TooltipProvider } from '@/components/tooltip/tooltip';
import { TableNode, type TableNodeType } from './table-node';

const diff = vi.hoisted(() => ({
    checkIfNewTable: () => false,
    checkIfTableHasChange: () => false,
    checkIfTableRemoved: () => false,
    getTableNewColor: () => undefined,
    getTableNewName: () => undefined,
    isSummaryOnly: false,
}));

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    NodeResizer: () => null,
    Position: { Top: 'top' },
    useConnection: () => ({ inProgress: false, fromNode: { id: '' } }),
    useStore: () => [],
}));

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({
        relationships: [],
        readonly: true,
        updateTable: vi.fn(),
    }),
}));

vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({
        closeAllTablesInSidebar: vi.fn(),
        openTableFromSidebar: vi.fn(),
        selectSidebarSection: vi.fn(),
    }),
}));

vi.mock('@/hooks/use-canvas', () => ({
    useCanvas: () => ({
        editTableModeTable: null,
        setEditTableModeTable: vi.fn(),
        setHoveringTableId: vi.fn(),
        showCreateRelationshipNode: vi.fn(),
        tempFloatingEdge: null,
    }),
}));

vi.mock('@/context/diff-context/use-diff', () => ({
    useDiff: () => diff,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./table-node-context-menu', () => ({
    TableNodeContextMenu: ({ children }: React.PropsWithChildren) => children,
}));

vi.mock('./table-node-dependency-indicator', () => ({
    TableNodeDependencyIndicator: () => null,
}));

vi.mock('./table-node-status/table-node-status', () => ({
    TableNodeStatus: () => null,
}));

vi.mock('./table-edit-mode/table-edit-mode', () => ({
    TableEditMode: () => null,
}));

vi.mock('./table-node-field', () => ({ TableNodeField: () => null }));

const nodeProps = (comments?: string): NodeProps<TableNodeType> => {
    const table: DBTable = {
        id: 'table-1',
        name: 'users',
        schema: 'public',
        x: 0,
        y: 0,
        fields: [],
        indexes: [],
        color: '#94a3b8',
        isView: false,
        createdAt: 1,
        comments,
    };

    return {
        id: table.id,
        type: 'table',
        data: { table, isOverlapping: false },
        selected: false,
        dragging: false,
        zIndex: 0,
        selectable: true,
        deletable: true,
        draggable: true,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
    };
};

it('shows a table comment without requiring hover', () => {
    const { rerender } = render(
        <TooltipProvider delayDuration={0}>
            <TableNode {...nodeProps('Stores customer accounts')} />
        </TooltipProvider>
    );

    expect(screen.getByText('Stores customer accounts')).toBeVisible();

    rerender(
        <TooltipProvider delayDuration={0}>
            <TableNode {...nodeProps()} />
        </TooltipProvider>
    );

    expect(
        screen.queryByText('Stores customer accounts')
    ).not.toBeInTheDocument();
});
