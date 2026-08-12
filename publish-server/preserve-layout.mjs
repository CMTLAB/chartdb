const VISUAL_KEYS = [
    'x',
    'y',
    'width',
    'color',
    'expanded',
    'parentAreaId',
    'order',
];

const DEFAULT_TABLE_WIDTH = 224;
const NEW_TABLE_GAP = 100;

const tableKey = (table) => `${table.schema ?? ''}\u0000${table.name}`;

const rightEdge = (item, defaultWidth = 0) =>
    Number.isFinite(item?.x)
        ? item.x + (Number.isFinite(item?.width) ? item.width : defaultWidth)
        : null;

export const preserveSharedLayout = (freshDiagram, existingDiagram) => {
    if (
        !freshDiagram ||
        !Array.isArray(freshDiagram.tables) ||
        !existingDiagram ||
        !Array.isArray(existingDiagram.tables)
    ) {
        return freshDiagram;
    }

    const existingByKey = new Map(
        existingDiagram.tables.map((table) => [tableKey(table), table])
    );
    const matchedExisting = [];
    const newTableIndexes = [];

    const tables = freshDiagram.tables.map((freshTable, index) => {
        const existingTable = existingByKey.get(tableKey(freshTable));
        if (!existingTable) {
            newTableIndexes.push(index);
            return { ...freshTable };
        }

        matchedExisting.push(existingTable);
        const merged = { ...freshTable };
        for (const key of VISUAL_KEYS) {
            if (Object.hasOwn(existingTable, key)) {
                merged[key] = existingTable[key];
            }
        }
        if (!freshTable.comments && existingTable.comments) {
            merged.comments = existingTable.comments;
        }
        return merged;
    });

    const preservedRightEdges = [
        ...matchedExisting.map((table) =>
            rightEdge(table, DEFAULT_TABLE_WIDTH)
        ),
        ...(Array.isArray(existingDiagram.areas)
            ? existingDiagram.areas.map((area) => rightEdge(area))
            : []),
    ].filter(Number.isFinite);

    if (newTableIndexes.length > 0 && preservedRightEdges.length > 0) {
        const newXs = newTableIndexes
            .map((index) => tables[index].x)
            .filter(Number.isFinite);
        if (newXs.length > 0) {
            const offset = Math.max(
                0,
                Math.max(...preservedRightEdges) +
                    NEW_TABLE_GAP -
                    Math.min(...newXs)
            );
            for (const index of newTableIndexes) {
                if (Number.isFinite(tables[index].x)) {
                    tables[index].x += offset;
                }
            }
        }
    }

    return {
        ...freshDiagram,
        tables,
        areas: Array.isArray(existingDiagram.areas)
            ? existingDiagram.areas
            : freshDiagram.areas,
        notes: Array.isArray(existingDiagram.notes)
            ? existingDiagram.notes
            : freshDiagram.notes,
    };
};
