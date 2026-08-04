import assert from 'node:assert/strict';
import { test } from 'node:test';

import { preserveSharedLayout } from '../preserve-layout.mjs';

const table = (name, overrides = {}) => ({
    id: `fresh-${name}`,
    schema: 'public',
    name,
    x: 100,
    y: 100,
    width: 224,
    color: '#new',
    fields: [],
    indexes: [],
    ...overrides,
});

test('metadata refresh preserves presentation but keeps fresh schema data', () => {
    const fresh = {
        tables: [table('jobs'), table('new_table')],
        relationships: [{ id: 'fresh-relationship' }],
        areas: [],
        notes: [],
    };
    const existing = {
        tables: [
            table('jobs', {
                id: 'old-jobs',
                x: 700,
                y: 800,
                color: '#manual',
                fields: [{ id: 'old-field' }],
            }),
        ],
        relationships: [{ id: 'old-relationship' }],
        areas: [{ id: 'area-1' }],
        notes: [{ id: 'note-1' }],
    };

    const merged = preserveSharedLayout(fresh, existing);

    assert.deepEqual(
        {
            x: merged.tables[0].x,
            y: merged.tables[0].y,
            color: merged.tables[0].color,
            fields: merged.tables[0].fields,
        },
        { x: 700, y: 800, color: '#manual', fields: [] }
    );
    assert.deepEqual(merged.relationships, fresh.relationships);
    assert.deepEqual(merged.areas, existing.areas);
    assert.deepEqual(merged.notes, existing.notes);
});

test('metadata refresh keeps the fresh diagram when no prior layout exists', () => {
    const fresh = { tables: [table('jobs')], areas: [], notes: [] };

    assert.equal(preserveSharedLayout(fresh, null), fresh);
});
