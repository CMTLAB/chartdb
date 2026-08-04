import { describe, expect, it } from 'vitest';
import { initialTablesLoaded } from './initial-table-load';

describe('initialTablesLoaded', () => {
    it('recognizes loaded tables even when canvas nodes contain extra data', () => {
        const initialTables = [{ id: 'table-1' }, { id: 'table-2' }];
        const nodes = [
            { id: 'area-1', type: 'area', data: {} },
            {
                id: 'table-1',
                type: 'table',
                data: { targetEdgeCounts: { 'field-1': 1 } },
            },
            { id: 'table-2', type: 'table', data: { isOverlapping: false } },
        ];

        expect(initialTablesLoaded(initialTables, nodes)).toBe(true);
    });
});
