import { applyDBMLChanges } from '@/lib/dbml/apply-dbml/apply-dbml';
import { MIN_TABLE_SIZE } from '@/lib/domain/db-table';
import type { DBTable } from '@/lib/domain/db-table';
import type { Diagram } from '@/lib/domain/diagram';
import { generateDiff } from '@/lib/domain/diff/diff-check/diff-check';

const tableKey = ({ schema, name }: DBTable) => `${schema ?? ''}\0${name}`;
const customTypeKey = ({
    schema,
    name,
}: {
    schema?: string | null;
    name: string;
}) => `${schema ?? ''}\0${name}`;

export const prepareDiagramRefresh = ({
    currentDiagram,
    refreshedDiagram,
}: {
    currentDiagram: Diagram;
    refreshedDiagram: Diagram;
}) => {
    const currentTables = currentDiagram.tables ?? [];
    const currentTablesByKey = new Map(
        currentTables.map((table) => [tableKey(table), table])
    );
    const refreshedTables = refreshedDiagram.tables ?? [];
    const newTables = refreshedTables.filter(
        (table) => !currentTablesByKey.has(tableKey(table))
    );
    const rightEdges = [
        ...currentTables.map(
            (table) => table.x + (table.width ?? MIN_TABLE_SIZE)
        ),
        ...(currentDiagram.areas ?? []).map((area) => area.x + area.width),
    ];
    const newTablesOffset =
        newTables.length && rightEdges.length
            ? Math.max(...rightEdges) +
              100 -
              Math.min(...newTables.map((table) => table.x))
            : 0;
    const targetTables = refreshedTables.map((table) => {
        const currentTable = currentTablesByKey.get(tableKey(table));

        return {
            ...table,
            comments: table.comments || currentTable?.comments,
            x: currentTable ? table.x : table.x + newTablesOffset,
        };
    });
    const targetTablesByKey = new Map(
        targetTables.map((table) => [tableKey(table), table])
    );
    const targetDiagram: Diagram = {
        ...currentDiagram,
        databaseType: refreshedDiagram.databaseType,
        databaseEdition: refreshedDiagram.databaseEdition,
        tables: targetTables,
        relationships: refreshedDiagram.relationships,
        dependencies: refreshedDiagram.dependencies,
        customTypes: refreshedDiagram.customTypes,
    };
    const mergedDiagram = applyDBMLChanges({
        sourceDiagram: currentDiagram,
        targetDiagram,
        matchTablesBySchemaExactly: true,
        preserveTargetSchemaProperties: true,
    });
    const currentCustomTypeIds = new Map(
        (currentDiagram.customTypes ?? []).map((type) => [
            customTypeKey(type),
            type.id,
        ])
    );
    const diagram: Diagram = {
        ...mergedDiagram,
        databaseType: targetDiagram.databaseType,
        databaseEdition: targetDiagram.databaseEdition,
        tables: (mergedDiagram.tables ?? []).map((table) => {
            const currentTable = currentTablesByKey.get(tableKey(table));
            const targetTable = targetTablesByKey.get(tableKey(table));

            return currentTable && targetTable
                ? {
                      ...targetTable,
                      id: table.id,
                      createdAt: table.createdAt,
                      fields: table.fields,
                      indexes: table.indexes,
                      checkConstraints: table.checkConstraints,
                      comments: table.comments,
                      x: table.x,
                      y: table.y,
                      width: table.width,
                      color: table.color,
                      expanded: table.expanded,
                      order: table.order,
                      parentAreaId: table.parentAreaId,
                  }
                : table;
        }),
        customTypes: (refreshedDiagram.customTypes ?? []).map((type) => ({
            ...type,
            id: currentCustomTypeIds.get(customTypeKey(type)) ?? type.id,
        })),
    };
    const { diffMap, changedTables } = generateDiff({
        diagram: currentDiagram,
        newDiagram: diagram,
    });
    const refreshedKeys = new Set(refreshedTables.map(tableKey));
    const addedTables = refreshedTables.filter(
        (table) => !currentTablesByKey.has(tableKey(table))
    ).length;
    const removedTables = currentTables.filter(
        (table) => !refreshedKeys.has(tableKey(table))
    ).length;
    const changedTableCount = currentTables.filter((table) => {
        const refreshedTable = targetTablesByKey.get(tableKey(table));

        return (
            refreshedTable &&
            (changedTables.has(table.id) ||
                table.isView !== refreshedTable.isView ||
                table.isMaterializedView !== refreshedTable.isMaterializedView)
        );
    }).length;
    const hasUntrackedChanges =
        currentDiagram.databaseType !== diagram.databaseType ||
        currentDiagram.databaseEdition !== diagram.databaseEdition ||
        JSON.stringify(currentDiagram.dependencies ?? []) !==
            JSON.stringify(diagram.dependencies ?? []) ||
        JSON.stringify(currentDiagram.customTypes ?? []) !==
            JSON.stringify(diagram.customTypes ?? []);

    return {
        diagram,
        summary: {
            addedTables,
            changedTables: changedTableCount,
            removedTables,
            hasChanges:
                diffMap.size > 0 ||
                changedTableCount > 0 ||
                hasUntrackedChanges,
        },
    };
};
