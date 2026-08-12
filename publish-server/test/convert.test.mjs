import assert from 'node:assert/strict';
import { test } from 'node:test';

import { metadataToDiagramJSON } from '../convert-bundle.mjs';

test('converter keeps dotted schema and table identifiers isolated', async () => {
    const diagram = JSON.parse(
        await metadataToDiagramJSON({
            databaseType: 'postgresql',
            metadata: {
                database_name: 'database',
                version: '1',
                tables: [
                    { schema: 'a.b', table: 'c' },
                    { schema: 'a', table: 'b.c' },
                ],
                columns: [
                    {
                        schema: 'a.b',
                        table: 'c',
                        name: 'from_ab',
                        type: 'text',
                        ordinal_position: 1,
                        nullable: false,
                    },
                    {
                        schema: 'a',
                        table: 'b.c',
                        name: 'from_a',
                        type: 'text',
                        ordinal_position: 1,
                        nullable: false,
                    },
                ],
                indexes: [],
                pk_info: [],
                fk_info: [],
                views: [],
            },
        })
    );

    assert.deepEqual(
        diagram.tables.map(({ schema, name, fields }) => ({
            schema,
            name,
            fields: fields.map((field) => field.name),
        })),
        [
            { schema: 'a', name: 'b.c', fields: ['from_a'] },
            { schema: 'a.b', name: 'c', fields: ['from_ab'] },
        ]
    );
});
