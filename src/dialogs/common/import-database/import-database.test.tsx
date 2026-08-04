import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import { ImportDatabase, type ImportDatabaseProps } from './import-database';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({ effectiveTheme: 'light' }),
}));

vi.mock('@/hooks/use-breakpoint', () => ({
    useBreakpoint: () => ({ isSm: true }),
}));

vi.mock('@/hooks/use-debounce-v2', () => ({
    useDebounce: (callback: unknown) => callback,
}));

vi.mock('@/components/code-snippet/code-snippet', () => ({
    Editor: ({ value }: { value: string }) => (
        <textarea aria-label="editor" readOnly value={value} />
    ),
}));

vi.mock('@/components/zoomable-image/zoomable-image', () => ({
    ZoomableImage: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
}));

vi.mock('@/components/resizable/resizable', () => ({
    ResizablePanelGroup: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    ResizablePanel: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    ResizableHandle: () => <div />,
}));

vi.mock('@/components/dialog/dialog', () => ({
    DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
    DialogDescription: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogFooter: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogHeader: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogInternalContent: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogTitle: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
}));

vi.mock('./instructions-section/instructions-section', () => ({
    InstructionsSection: () => <div />,
}));

vi.mock('./sql-validation-status', () => ({
    SQLValidationStatus: ({ errorMessage }: { errorMessage: string }) => (
        <div>{errorMessage}</div>
    ),
}));

const renderImportDatabase = (props: Partial<ImportDatabaseProps> = {}) => {
    const defaultProps: ImportDatabaseProps = {
        onImport: vi.fn(),
        scriptResult: '',
        setScriptResult: vi.fn(),
        databaseType: DatabaseType.ORACLE,
        setDatabaseEdition: vi.fn(),
        title: 'Import database',
        importMethod: 'query',
        setImportMethod: vi.fn(),
    };

    return render(<ImportDatabase {...defaultProps} {...props} />);
};

describe('ImportDatabase Smart Query file import', () => {
    it('renders a dedicated JSON file selection row above the editor', () => {
        renderImportDatabase();

        const fileRow = screen.getByRole('group', {
            name: 'Smart Query JSON file',
        });
        const editor = screen.getByLabelText('editor');

        expect(
            within(fileRow).getByRole('button', {
                name: 'Select JSON file',
            })
        ).toBeInTheDocument();
        expect(
            within(fileRow).getByText('Load a saved Smart Query JSON result.')
        ).toBeInTheDocument();
        expect(
            fileRow.compareDocumentPosition(editor) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('loads a selected JSON file into the Smart Query editor', async () => {
        const user = userEvent.setup();
        const setScriptResult = vi.fn();
        const { container } = renderImportDatabase({ setScriptResult });
        setScriptResult.mockClear();
        const input = container.querySelector('input[type="file"]');
        const json = '{"tables":[]}';
        const file = new File([json], 'metadata.json', {
            type: 'application/json',
        });
        Object.defineProperty(file, 'text', {
            value: vi.fn().mockResolvedValue(json),
        });

        await user.upload(input as HTMLInputElement, file);

        await waitFor(() => expect(setScriptResult).toHaveBeenCalledWith(json));
        expect(await screen.findByText('metadata.json')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Choose another file' })
        ).toBeInTheDocument();
    });

    it('unwraps an IntelliJ JSON export when the file is selected', async () => {
        const user = userEvent.setup();
        const setScriptResult = vi.fn();
        const { container } = renderImportDatabase({ setScriptResult });
        setScriptResult.mockClear();
        const input = container.querySelector('input[type="file"]');
        const metadata = {
            fk_info: [],
            pk_info: [],
            columns: [],
            indexes: [],
            tables: [],
            views: [],
            database_name: 'qualys',
            version: '19c',
        };
        const exportedJson = JSON.stringify([
            {
                METADATA_JSON_TO_IMPORT: JSON.stringify(metadata),
            },
        ]);
        const file = new File([exportedJson], 'qualys_data.json', {
            type: 'application/json',
        });
        Object.defineProperty(file, 'text', {
            value: vi.fn().mockResolvedValue(exportedJson),
        });

        await user.upload(input as HTMLInputElement, file);

        await waitFor(() =>
            expect(setScriptResult).toHaveBeenCalledWith(
                JSON.stringify(metadata)
            )
        );
    });

    it('keeps the editor content when the selected file cannot be read', async () => {
        const user = userEvent.setup();
        const setScriptResult = vi.fn();
        const { container } = renderImportDatabase({ setScriptResult });
        setScriptResult.mockClear();
        const input = container.querySelector('input[type="file"]');
        const file = new File([''], 'metadata.json', {
            type: 'application/json',
        });
        Object.defineProperty(file, 'text', {
            value: vi.fn().mockRejectedValue(new Error('read failed')),
        });

        await user.upload(input as HTMLInputElement, file);

        await screen.findByText('Unable to read the selected file.');
        expect(setScriptResult).not.toHaveBeenCalled();
        expect(screen.queryByText('metadata.json')).not.toBeInTheDocument();
    });

    it('offers Import immediately for metadata with a null table comment', () => {
        renderImportDatabase({
            scriptResult: JSON.stringify({
                fk_info: [],
                pk_info: [],
                columns: [],
                indexes: [],
                tables: [
                    {
                        schema: 'CLO_QUALYS',
                        table: 'CL_CR_ACCOUNT',
                        comment: null,
                    },
                ],
                views: [],
                database_name: 'FREEPDB1',
                version: 'FREEPDB1',
            }),
        });

        expect(
            screen.getByRole('button', {
                name: 'new_diagram_dialog.import',
            })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'new_diagram_dialog.import_database.check_script_result',
            })
        ).not.toBeInTheDocument();
    });
});
