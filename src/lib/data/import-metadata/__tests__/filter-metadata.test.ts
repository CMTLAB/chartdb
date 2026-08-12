import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain';
import { filterMetadataByTables } from '../filter-metadata';
import { loadFromDatabaseMetadata } from '../import';
import { prepareDiagramRefresh } from '../refresh-diagram';

describe('filterMetadataByTables', () => {
    it('distinguishes dots in schema names from dots in table names', () => {
        const result = filterMetadataByTables({
            metadata: {
                database_name: 'database',
                version: '1',
                tables: [
                    { schema: 'a.b', table: 'c' },
                    { schema: 'a', table: 'b.c' },
                ],
                views: [],
                columns: [],
                indexes: [],
                fk_info: [],
                pk_info: [],
            },
            selectedTables: [{ schema: 'a.b', table: 'c', type: 'table' }],
        });

        expect(result.tables).toEqual([{ schema: 'a.b', table: 'c' }]);
    });

    it('keeps the table metadata needed to import a selected view', async () => {
        const metadata = {
            database_name: 'database',
            version: '1',
            tables: [{ schema: 'public', table: 'active_users' }],
            views: [
                {
                    schema: 'public',
                    view_name: 'active_users',
                    view_definition:
                        'Q1JFQVRFIFZJRVcgcHVibGljLmFjdGl2ZV91c2VycyBBUyBTRUxFQ1QgMTs=',
                },
            ],
            columns: [],
            indexes: [],
            fk_info: [],
            pk_info: [],
        };

        const refreshedDiagram = await loadFromDatabaseMetadata({
            databaseType: DatabaseType.POSTGRESQL,
            databaseMetadata: filterMetadataByTables({
                metadata,
                selectedTables: [
                    {
                        schema: 'public',
                        table: 'active_users',
                        type: 'view',
                    },
                ],
            }),
        });
        const refresh = prepareDiagramRefresh({
            currentDiagram: {
                ...refreshedDiagram,
                id: 'current',
                tables: [],
            },
            refreshedDiagram,
        });

        expect(refresh.diagram.tables).toEqual([
            expect.objectContaining({
                name: 'active_users',
                isView: true,
            }),
        ]);
    });
});
