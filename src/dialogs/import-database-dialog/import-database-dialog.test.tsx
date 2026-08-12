import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseType, type DBTable, type Diagram } from '@/lib/domain';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { SelectedTable } from '@/lib/data/import-metadata/filter-metadata';
import { ImportDatabaseDialog } from './import-database-dialog';

const mocks = vi.hoisted(() => ({
    useChartDB: vi.fn(),
    closeImportDatabaseDialog: vi.fn(),
    showAlert: vi.fn(),
    loadDatabaseMetadata: vi.fn(),
    loadFromDatabaseMetadata: vi.fn(),
}));

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: mocks.useChartDB,
}));

vi.mock('@/hooks/use-dialog', () => ({
    useDialog: () => ({
        closeImportDatabaseDialog: mocks.closeImportDatabaseDialog,
    }),
}));

vi.mock('@/hooks/use-redo-undo-stack', () => ({
    useRedoUndoStack: () => ({
        resetRedoStack: vi.fn(),
        resetUndoStack: vi.fn(),
    }),
}));

vi.mock('@/context/alert-context/alert-context', () => ({
    useAlert: () => ({ showAlert: mocks.showAlert }),
}));

vi.mock('@/lib/data/import-metadata/metadata-types/database-metadata', () => ({
    loadDatabaseMetadata: mocks.loadDatabaseMetadata,
}));

vi.mock('@/lib/data/import-metadata/import', () => ({
    loadFromDatabaseMetadata: mocks.loadFromDatabaseMetadata,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'ko-KR' },
    }),
}));

vi.mock('@/components/dialog/dialog', () => ({
    Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
    DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../common/import-database/import-database', () => ({
    ImportDatabase: ({
        title,
        setScriptResult,
        onImport,
    }: {
        title: string;
        setScriptResult: (value: string) => void;
        onImport: () => void;
    }) => (
        <div>
            <h1>{title}</h1>
            <button onClick={() => setScriptResult('metadata')}>
                파일 선택
            </button>
            <button onClick={onImport}>가져오기</button>
        </div>
    ),
}));

interface SelectTablesTestProps {
    initialSelectedTables?: SelectedTable[];
    databaseMetadata?: DatabaseMetadata;
    allowEmptySelection?: boolean;
    onImport: (input: {
        selectedTables?: SelectedTable[];
        databaseMetadata?: DatabaseMetadata;
    }) => Promise<void>;
}

vi.mock('../common/select-tables/select-tables', () => ({
    SelectTables: ({
        initialSelectedTables,
        databaseMetadata,
        allowEmptySelection,
        onImport,
    }: SelectTablesTestProps) => {
        const selectedTables = initialSelectedTables?.filter(
            ({ schema, table, type }) =>
                type === 'table'
                    ? databaseMetadata?.tables.some(
                          (metadataTable) =>
                              metadataTable.schema === schema &&
                              metadataTable.table === table
                      )
                    : databaseMetadata?.views.some(
                          (view) =>
                              view.schema === schema && view.view_name === table
                      )
        );

        return (
            <div>
                <span>테이블 선택</span>
                <span>
                    {selectedTables?.map(({ table }) => table).join(',')}
                </span>
                <button
                    onClick={() =>
                        onImport({
                            selectedTables: [
                                {
                                    schema: 'public',
                                    table: 'users',
                                    type: 'table',
                                },
                            ],
                            databaseMetadata,
                        })
                    }
                >
                    선택 반영
                </button>
                {allowEmptySelection && (
                    <button
                        onClick={() =>
                            onImport({
                                selectedTables: [],
                                databaseMetadata,
                            })
                        }
                    >
                        전체 해제 반영
                    </button>
                )}
            </div>
        );
    },
}));

const table = (overrides: Partial<DBTable>): DBTable => ({
    id: 'table',
    name: 'table',
    schema: 'public',
    x: 0,
    y: 0,
    fields: [],
    indexes: [],
    color: '#999999',
    isView: false,
    createdAt: 1,
    ...overrides,
});

const diagram = (tables: DBTable[]): Diagram => ({
    id: 'diagram',
    name: 'ERD',
    databaseType: DatabaseType.POSTGRESQL,
    tables,
    relationships: [],
    dependencies: [],
    customTypes: [],
    areas: [],
    notes: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
});

const metadata = (): DatabaseMetadata => ({
    database_name: 'database',
    version: '1',
    tables: [
        { schema: 'public', table: 'users' },
        { schema: 'public', table: 'audit' },
    ],
    views: [],
    columns: [],
    indexes: [],
    fk_info: [],
    pk_info: [],
});

describe('ImportDatabaseDialog Smart Query refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.loadDatabaseMetadata.mockReturnValue(metadata());
    });

    it('shows matching current tables for selection before loading a refresh', async () => {
        const user = userEvent.setup();
        const currentDiagram = diagram([
            table({ id: 'users-current', name: 'users' }),
            table({ id: 'legacy-current', name: 'legacy' }),
        ]);
        mocks.useChartDB.mockReturnValue({
            addTables: vi.fn(),
            addRelationships: vi.fn(),
            diagramName: 'ERD',
            databaseType: DatabaseType.POSTGRESQL,
            updateDatabaseType: vi.fn(),
            tables: currentDiagram.tables,
            currentDiagram,
            updateDiagramData: vi.fn(),
        });

        render(
            <ImportDatabaseDialog
                dialog={{ open: true }}
                databaseType={DatabaseType.POSTGRESQL}
                importMethods={['query']}
                initialImportMethod="query"
                refreshExistingDiagram
            />
        );
        await user.click(screen.getByRole('button', { name: '파일 선택' }));
        await user.click(screen.getByRole('button', { name: '가져오기' }));

        expect(screen.getByText('테이블 선택')).toBeInTheDocument();
        expect(screen.getByText('users')).toBeInTheDocument();
        expect(mocks.loadFromDatabaseMetadata).not.toHaveBeenCalled();
        expect(mocks.showAlert).not.toHaveBeenCalled();
    });

    it('filters a refresh to the selected tables', async () => {
        const user = userEvent.setup();
        const currentDiagram = diagram([
            table({ id: 'users-current', name: 'users' }),
            table({ id: 'legacy-current', name: 'legacy' }),
        ]);
        mocks.useChartDB.mockReturnValue({
            addTables: vi.fn(),
            addRelationships: vi.fn(),
            diagramName: 'ERD',
            databaseType: DatabaseType.POSTGRESQL,
            updateDatabaseType: vi.fn(),
            tables: currentDiagram.tables,
            currentDiagram,
            updateDiagramData: vi.fn(),
        });
        mocks.loadFromDatabaseMetadata.mockResolvedValue(
            diagram([table({ id: 'users-fresh', name: 'users' })])
        );

        render(
            <ImportDatabaseDialog
                dialog={{ open: true }}
                databaseType={DatabaseType.POSTGRESQL}
                importMethods={['query']}
                initialImportMethod="query"
                refreshExistingDiagram
            />
        );
        await user.click(screen.getByRole('button', { name: '파일 선택' }));
        await user.click(screen.getByRole('button', { name: '가져오기' }));
        await user.click(screen.getByRole('button', { name: '선택 반영' }));

        await waitFor(() =>
            expect(mocks.loadFromDatabaseMetadata).toHaveBeenCalledWith(
                expect.objectContaining({
                    databaseMetadata: expect.objectContaining({
                        tables: [expect.objectContaining({ table: 'users' })],
                    }),
                })
            )
        );
    });

    it('uses empty metadata to summarize removal after clearing a refresh selection', async () => {
        const user = userEvent.setup();
        const currentDiagram = diagram([
            table({ id: 'users-current', name: 'users' }),
        ]);
        mocks.useChartDB.mockReturnValue({
            addTables: vi.fn(),
            addRelationships: vi.fn(),
            diagramName: 'ERD',
            databaseType: DatabaseType.POSTGRESQL,
            updateDatabaseType: vi.fn(),
            tables: currentDiagram.tables,
            currentDiagram,
            updateDiagramData: vi.fn(),
        });
        mocks.loadFromDatabaseMetadata.mockResolvedValue(diagram([]));

        render(
            <ImportDatabaseDialog
                dialog={{ open: true }}
                databaseType={DatabaseType.POSTGRESQL}
                importMethods={['query']}
                initialImportMethod="query"
                refreshExistingDiagram
            />
        );
        await user.click(screen.getByRole('button', { name: '파일 선택' }));
        await user.click(screen.getByRole('button', { name: '가져오기' }));
        await user.click(
            screen.getByRole('button', { name: '전체 해제 반영' })
        );

        await waitFor(() =>
            expect(mocks.loadFromDatabaseMetadata).toHaveBeenCalledWith(
                expect.objectContaining({
                    databaseMetadata: expect.objectContaining({
                        tables: [],
                        views: [],
                    }),
                })
            )
        );
        expect(mocks.showAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                description: '테이블 추가 0개, 변경 0개, 삭제 1개입니다.',
            })
        );
    });

    it('shows the change summary before replacing the current diagram', async () => {
        const user = userEvent.setup();
        const updateDiagramData = vi.fn().mockResolvedValue(undefined);
        const currentDiagram = diagram([
            table({ id: 'users-current', name: 'users', comments: '설명' }),
            table({ id: 'legacy-current', name: 'legacy' }),
        ]);
        const refreshedDiagram = diagram([
            table({
                id: 'users-fresh',
                name: 'users',
                comments: '최신 설명',
            }),
            table({ id: 'audit-fresh', name: 'audit' }),
        ]);
        mocks.useChartDB.mockReturnValue({
            addTables: vi.fn(),
            addRelationships: vi.fn(),
            diagramName: 'ERD',
            databaseType: DatabaseType.POSTGRESQL,
            updateDatabaseType: vi.fn(),
            tables: currentDiagram.tables,
            currentDiagram,
            updateDiagramData,
        });
        mocks.loadFromDatabaseMetadata.mockResolvedValue(refreshedDiagram);

        render(
            <ImportDatabaseDialog
                dialog={{ open: true }}
                databaseType={DatabaseType.POSTGRESQL}
                importMethods={['query']}
                initialImportMethod="query"
                refreshExistingDiagram
            />
        );
        await user.click(screen.getByRole('button', { name: '파일 선택' }));
        await user.click(screen.getByRole('button', { name: '가져오기' }));
        await user.click(screen.getByRole('button', { name: '선택 반영' }));

        await waitFor(() => expect(mocks.showAlert).toHaveBeenCalledOnce());
        expect(updateDiagramData).not.toHaveBeenCalled();
        const alert = mocks.showAlert.mock.calls[0][0];
        expect(alert).toMatchObject({
            title: 'Smart Query 변경사항을 반영할까요?',
            description: '테이블 추가 1개, 변경 1개, 삭제 1개입니다.',
            actionLabel: '변경사항 반영',
            closeLabel: '취소',
        });

        await alert.onAction();

        expect(updateDiagramData).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'diagram' }),
            { forceUpdateStorage: true }
        );
        expect(mocks.closeImportDatabaseDialog).toHaveBeenCalledOnce();
    });

    it('does not save when the Smart Query result has no changes', async () => {
        const user = userEvent.setup();
        const updateDiagramData = vi.fn();
        const currentDiagram = diagram([
            table({ id: 'users-current', name: 'users', x: 300, y: 200 }),
        ]);
        mocks.useChartDB.mockReturnValue({
            addTables: vi.fn(),
            addRelationships: vi.fn(),
            diagramName: 'ERD',
            databaseType: DatabaseType.POSTGRESQL,
            updateDatabaseType: vi.fn(),
            tables: currentDiagram.tables,
            currentDiagram,
            updateDiagramData,
        });
        mocks.loadFromDatabaseMetadata.mockResolvedValue(
            diagram([table({ id: 'users-fresh', name: 'users' })])
        );

        render(
            <ImportDatabaseDialog
                dialog={{ open: true }}
                databaseType={DatabaseType.POSTGRESQL}
                importMethods={['query']}
                refreshExistingDiagram
            />
        );
        await user.click(screen.getByRole('button', { name: '파일 선택' }));
        await user.click(screen.getByRole('button', { name: '가져오기' }));
        await user.click(screen.getByRole('button', { name: '선택 반영' }));

        await waitFor(() => expect(mocks.showAlert).toHaveBeenCalledOnce());
        expect(mocks.showAlert.mock.calls[0][0]).toMatchObject({
            title: '변경사항 없음',
            closeLabel: '닫기',
        });
        expect(updateDiagramData).not.toHaveBeenCalled();
    });
});
