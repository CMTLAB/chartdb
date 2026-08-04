export const initialTablesLoaded = (
    initialTables: ReadonlyArray<{ id: string }>,
    nodes: ReadonlyArray<{ id: string; type?: string }>
): boolean => {
    const tableNodeIds = new Set(
        nodes.filter(({ type }) => type === 'table').map(({ id }) => id)
    );

    return (
        initialTables.length === tableNodeIds.size &&
        initialTables.every(({ id }) => tableNodeIds.has(id))
    );
};
