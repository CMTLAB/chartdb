import { describe, expect, it } from 'vitest';
import {
    DatabaseType,
    DBCustomTypeKind,
    type DBField,
    type DBTable,
    type Diagram,
} from '@/lib/domain';
import { prepareDiagramRefresh } from '../refresh-diagram';

const field = (id: string, name: string, type = 'integer'): DBField => ({
    id,
    name,
    type: { id: type, name: type },
    primaryKey: false,
    nullable: false,
    unique: false,
    createdAt: 1,
});

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

const diagram = (overrides: Partial<Diagram>): Diagram => ({
    id: 'diagram',
    name: 'ERD',
    databaseType: DatabaseType.POSTGRESQL,
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
});

describe('prepareDiagramRefresh', () => {
    it('keeps the layout while applying added, changed, and removed tables', () => {
        const currentDiagram = diagram({
            tables: [
                table({
                    id: 'users-current',
                    name: 'users',
                    x: 120,
                    y: 80,
                    width: 320,
                    color: '#123456',
                    expanded: true,
                    order: 7,
                    parentAreaId: 'area-1',
                    comments: '수동 테이블 설명',
                    fields: [field('id-current', 'id')],
                }),
                table({ id: 'legacy-current', name: 'legacy' }),
            ],
            areas: [
                {
                    id: 'area-1',
                    name: '회원 영역',
                    x: 10,
                    y: 10,
                    width: 500,
                    height: 400,
                    color: '#abcdef',
                },
            ],
            notes: [
                {
                    id: 'note-1',
                    content: '메모',
                    x: 30,
                    y: 30,
                    width: 200,
                    height: 100,
                    color: '#fedcba',
                },
            ],
        });
        const refreshedDiagram = diagram({
            id: 'imported',
            name: 'Imported',
            tables: [
                table({
                    id: 'users-fresh',
                    name: 'users',
                    comments: null,
                    fields: [field('id-fresh', 'id', 'bigint')],
                }),
                table({ id: 'audit-fresh', name: 'audit' }),
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });
        const users = result.diagram.tables?.find(
            ({ name }) => name === 'users'
        );

        expect(users).toMatchObject({
            id: 'users-current',
            x: 120,
            y: 80,
            width: 320,
            color: '#123456',
            expanded: true,
            order: 7,
            parentAreaId: 'area-1',
            comments: '수동 테이블 설명',
        });
        expect(users?.fields[0]).toMatchObject({
            id: 'id-current',
            type: { id: 'bigint', name: 'bigint' },
        });
        expect(result.diagram.tables?.map(({ name }) => name)).toEqual([
            'audit',
            'users',
        ]);
        expect(
            result.diagram.tables?.find(({ name }) => name === 'audit')?.x
        ).toBe(610);
        expect(result.diagram.areas).toEqual(currentDiagram.areas);
        expect(result.diagram.notes).toEqual(currentDiagram.notes);
        expect(result.summary).toEqual({
            addedTables: 1,
            changedTables: 1,
            removedTables: 1,
            hasChanges: true,
        });
    });

    it('keeps imported positions when the current diagram has no layout', () => {
        const result = prepareDiagramRefresh({
            currentDiagram: diagram({}),
            refreshedDiagram: diagram({
                tables: [table({ name: 'users', x: 40, y: 60 })],
            }),
        });

        expect(result.diagram.tables?.[0]).toMatchObject({ x: 40, y: 60 });
    });

    it('ignores generated ids and positions when schema data is unchanged', () => {
        const currentDiagram = diagram({
            tables: [
                table({
                    id: 'users-current',
                    name: 'users',
                    x: 300,
                    y: 200,
                    fields: [field('id-current', 'id')],
                }),
            ],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({
                    id: 'users-fresh',
                    name: 'users',
                    x: 0,
                    y: 0,
                    fields: [field('id-fresh', 'id')],
                }),
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.tables?.[0]).toMatchObject({
            id: 'users-current',
            x: 300,
            y: 200,
        });
        expect(result.summary).toEqual({
            addedTables: 0,
            changedTables: 0,
            removedTables: 0,
            hasChanges: false,
        });
    });

    it('uses refreshed table properties and removes stale composite types', () => {
        const currentDiagram = diagram({
            tables: [table({ id: 'users-current', name: 'users' })],
            customTypes: [
                {
                    id: 'address-current',
                    name: 'address',
                    schema: 'public',
                    kind: DBCustomTypeKind.composite,
                    fields: [{ field: 'city', type: 'text' }],
                },
            ],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({
                    id: 'users-fresh',
                    name: 'users',
                    isView: true,
                }),
            ],
            customTypes: [],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.tables?.[0].isView).toBe(true);
        expect(result.diagram.customTypes).toEqual([]);
        expect(result.summary).toMatchObject({
            changedTables: 1,
            hasChanges: true,
        });
    });

    it('remaps a newly added dependency to preserved table ids', () => {
        const currentDiagram = diagram({
            tables: [
                table({ id: 'users-current', name: 'users' }),
                table({ id: 'audit-current', name: 'audit' }),
            ],
            dependencies: undefined,
        });
        const refreshedDiagram = diagram({
            tables: [
                table({ id: 'users-fresh', name: 'users' }),
                table({ id: 'audit-fresh', name: 'audit' }),
            ],
            dependencies: [
                {
                    id: 'dependency-fresh',
                    tableId: 'users-fresh',
                    dependentTableId: 'audit-fresh',
                    createdAt: 2,
                },
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.dependencies).toEqual([
            expect.objectContaining({
                tableId: 'users-current',
                dependentTableId: 'audit-current',
            }),
        ]);
    });

    it('detects a field default change', () => {
        const currentDiagram = diagram({
            tables: [
                table({
                    id: 'users-current',
                    name: 'users',
                    fields: [field('created-current', 'created_at')],
                }),
            ],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({
                    id: 'users-fresh',
                    name: 'users',
                    fields: [
                        {
                            ...field('created-fresh', 'created_at'),
                            default: 'CURRENT_TIMESTAMP',
                        },
                    ],
                }),
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.tables?.[0].fields[0].default).toBe(
            'CURRENT_TIMESTAMP'
        );
        expect(result.summary).toMatchObject({
            changedTables: 1,
            hasChanges: true,
        });
    });

    it('detects a table changing into a view', () => {
        const currentDiagram = diagram({
            tables: [table({ id: 'report-current', name: 'report' })],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({
                    id: 'report-fresh',
                    name: 'report',
                    isView: true,
                }),
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.tables?.[0].isView).toBe(true);
        expect(result.summary).toMatchObject({
            changedTables: 1,
            hasChanges: true,
        });
    });

    it('keeps ids while applying refreshed index and relationship names', () => {
        const currentDiagram = diagram({
            tables: [
                table({
                    id: 'users-current',
                    name: 'users',
                    fields: [field('user-id-current', 'id')],
                    indexes: [
                        {
                            id: 'index-current',
                            name: 'users_id_old',
                            unique: true,
                            fieldIds: ['user-id-current'],
                            createdAt: 1,
                        },
                    ],
                }),
                table({
                    id: 'audit-current',
                    name: 'audit',
                    fields: [field('audit-user-id-current', 'user_id')],
                }),
            ],
            relationships: [
                {
                    id: 'relationship-current',
                    name: 'audit_user_old',
                    sourceTableId: 'audit-current',
                    sourceFieldId: 'audit-user-id-current',
                    targetTableId: 'users-current',
                    targetFieldId: 'user-id-current',
                    sourceCardinality: 'many',
                    targetCardinality: 'one',
                    createdAt: 1,
                },
            ],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({
                    id: 'users-fresh',
                    name: 'users',
                    fields: [field('user-id-fresh', 'id')],
                    indexes: [
                        {
                            id: 'index-fresh',
                            name: 'users_id_new',
                            unique: true,
                            fieldIds: ['user-id-fresh'],
                            createdAt: 2,
                        },
                    ],
                }),
                table({
                    id: 'audit-fresh',
                    name: 'audit',
                    fields: [field('audit-user-id-fresh', 'user_id')],
                }),
            ],
            relationships: [
                {
                    id: 'relationship-fresh',
                    name: 'audit_user_new',
                    sourceTableId: 'audit-fresh',
                    sourceFieldId: 'audit-user-id-fresh',
                    targetTableId: 'users-fresh',
                    targetFieldId: 'user-id-fresh',
                    sourceCardinality: 'many',
                    targetCardinality: 'one',
                    createdAt: 2,
                },
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(
            result.diagram.tables?.find(({ name }) => name === 'users')
                ?.indexes[0]
        ).toMatchObject({
            id: 'index-current',
            name: 'users_id_new',
        });
        expect(result.diagram.relationships?.[0]).toMatchObject({
            id: 'relationship-current',
            name: 'audit_user_new',
        });
    });

    it('ignores regenerated dependency identity metadata', () => {
        const currentDiagram = diagram({
            tables: [
                table({ id: 'users-current', name: 'users' }),
                table({ id: 'audit-current', name: 'audit' }),
            ],
            dependencies: [
                {
                    id: 'dependency-current',
                    tableId: 'users-current',
                    dependentTableId: 'audit-current',
                    createdAt: 1,
                },
            ],
        });
        const refreshedDiagram = diagram({
            tables: [
                table({ id: 'users-fresh', name: 'users' }),
                table({ id: 'audit-fresh', name: 'audit' }),
            ],
            dependencies: [
                {
                    id: 'dependency-fresh',
                    tableId: 'users-fresh',
                    dependentTableId: 'audit-fresh',
                    createdAt: 999,
                },
            ],
        });

        const result = prepareDiagramRefresh({
            currentDiagram,
            refreshedDiagram,
        });

        expect(result.diagram.dependencies?.[0]).toMatchObject({
            id: 'dependency-current',
            createdAt: 1,
        });
        expect(result.summary.hasChanges).toBe(false);
    });
});
