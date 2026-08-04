import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueMutation, isDiagramShaped } from './server.mjs';

const diagram = {
    id: 'diagram-1',
    name: 'Shared ERD',
    databaseType: 'oracle',
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [],
};

test('accepts complete exports and rejects unsafe diagram shapes', () => {
    assert.equal(isDiagramShaped(diagram), true);
    assert.equal(
        isDiagramShaped({
            ...diagram,
            tables: [{ id: 'table-1', fields: null, indexes: [] }],
        }),
        false
    );
    assert.equal(
        isDiagramShaped({ ...diagram, databaseType: 'unknown' }),
        false
    );
});

test('serializes shared-data mutations', async () => {
    const events = [];

    await Promise.all([
        enqueueMutation(async () => {
            events.push('first:start');
            await new Promise((resolve) => setTimeout(resolve, 10));
            events.push('first:end');
        }),
        enqueueMutation(async () => {
            events.push('second');
        }),
    ]);

    assert.deepEqual(events, ['first:start', 'first:end', 'second']);
});
