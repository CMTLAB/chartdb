const DATABASE_TYPES = new Set([
    'generic',
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
    'clickhouse',
    'cockroachdb',
    'oracle',
]);
const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = (value) => isObject(value) && typeof value.id === 'string';
const isOptionalArray = (value, check) =>
    value === undefined || (Array.isArray(value) && value.every(check));

export const isDiagramShaped = (diagram) =>
    hasId(diagram) &&
    typeof diagram.name === 'string' &&
    diagram.name.trim() !== '' &&
    DATABASE_TYPES.has(diagram.databaseType) &&
    isOptionalArray(
        diagram.tables,
        (table) =>
            hasId(table) &&
            Array.isArray(table.fields) &&
            table.fields.every(hasId) &&
            Array.isArray(table.indexes) &&
            table.indexes.every(
                (index) =>
                    hasId(index) &&
                    Array.isArray(index.fieldIds) &&
                    index.fieldIds.every((id) => typeof id === 'string')
            )
    ) &&
    isOptionalArray(
        diagram.relationships,
        (relationship) =>
            hasId(relationship) &&
            [
                'sourceTableId',
                'targetTableId',
                'sourceFieldId',
                'targetFieldId',
            ].every((key) => typeof relationship[key] === 'string')
    ) &&
    isOptionalArray(
        diagram.dependencies,
        (dependency) =>
            hasId(dependency) &&
            typeof dependency.dependentTableId === 'string' &&
            typeof dependency.tableId === 'string'
    ) &&
    ['areas', 'customTypes', 'notes'].every((key) =>
        isOptionalArray(diagram[key], hasId)
    );
