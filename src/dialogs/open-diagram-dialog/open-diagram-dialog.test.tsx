import {
    dialogContext,
    type DialogContext,
} from '@/context/dialog-context/dialog-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { OpenDiagramDialog } from './open-diagram-dialog';

const mocks = vi.hoisted(() => ({
    listDiagrams: vi.fn(),
    navigate: vi.fn(),
    updateConfig: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/use-config', () => ({
    useConfig: () => ({ updateConfig: mocks.updateConfig }),
}));

vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({
        listDiagrams: mocks.listDiagrams,
    }),
}));

vi.mock('@/components/diagram-icon/diagram-icon', () => ({
    DiagramIcon: () => <span />,
}));

vi.mock('./diagram-row-actions-menu/diagram-row-actions-menu', () => ({
    DiagramRowActionsMenu: () => null,
}));

const noOp = () => undefined;

const MandatoryOpenDialog = () => {
    const [open, setOpen] = useState(true);
    const actions: DialogContext = {
        openCreateDiagramDialog: noOp,
        closeCreateDiagramDialog: noOp,
        openOpenDiagramDialog: noOp,
        closeOpenDiagramDialog: () => setOpen(false),
        openExportSQLDialog: noOp,
        closeExportSQLDialog: noOp,
        openCreateRelationshipDialog: noOp,
        closeCreateRelationshipDialog: noOp,
        openImportDatabaseDialog: noOp,
        closeImportDatabaseDialog: noOp,
        openTableSchemaDialog: noOp,
        closeTableSchemaDialog: noOp,
        openStarUsDialog: noOp,
        closeStarUsDialog: noOp,
        openExportImageDialog: noOp,
        closeExportImageDialog: noOp,
        openExportDiagramDialog: noOp,
        closeExportDiagramDialog: noOp,
        openImportDiagramDialog: noOp,
        closeImportDiagramDialog: noOp,
    };

    return (
        <dialogContext.Provider value={actions}>
            {open ? (
                <OpenDiagramDialog dialog={{ open }} canClose={false} />
            ) : null}
        </dialogContext.Provider>
    );
};

test('closes the mandatory picker after opening the selected diagram', async () => {
    const user = userEvent.setup();
    mocks.listDiagrams.mockResolvedValue([
        {
            id: 'shared-demo',
            name: 'Shared Demo',
            databaseType: DatabaseType.GENERIC,
            createdAt: new Date('2026-08-04T00:00:00Z'),
            updatedAt: new Date('2026-08-04T00:00:00Z'),
            tables: [],
        } satisfies Partial<Diagram>,
    ]);
    render(<MandatoryOpenDialog />);

    await user.click(await screen.findByText('Shared Demo'));
    const openButton = screen.getByRole('button', {
        name: 'open_diagram_dialog.open',
    });
    expect(openButton).toBeEnabled();
    await user.click(openButton);

    await waitFor(() =>
        expect(screen.queryByText('Shared Demo')).not.toBeInTheDocument()
    );
});
