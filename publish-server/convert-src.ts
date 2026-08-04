// Headless converter: ChartDB smart-query metadata → diagram JSON.
// Bundled (esbuild) into convert-bundle.mjs so the publish sidecar can convert
// server-side without a browser. Same logic ChartDB's UI import uses.
import { loadFromDatabaseMetadata } from '@/lib/data/import-metadata/import';
import { diagramToJSONOutput } from '@/lib/export-import-utils';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';

// ChartDB's id generation reads localStorage (workspace id). Shim it for Node.
const g = globalThis as unknown as { localStorage?: unknown };
if (!g.localStorage) {
    const store: Record<string, string> = {};
    g.localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
            store[k] = v;
        },
        removeItem: (k: string) => {
            delete store[k];
        },
        clear: () => {
            for (const k of Object.keys(store)) delete store[k];
        },
    };
}

const TYPES = new Set<string>(Object.values(DatabaseType));

export async function metadataToDiagramJSON(input: {
    name?: string;
    databaseType: string;
    metadata: DatabaseMetadata;
}): Promise<string> {
    if (!TYPES.has(input.databaseType)) {
        throw new Error(`unsupported databaseType: ${input.databaseType}`);
    }
    const diagram = await loadFromDatabaseMetadata({
        databaseType: input.databaseType as DatabaseType,
        databaseMetadata: input.metadata,
    });
    return diagramToJSONOutput({
        ...diagram,
        name: input.name?.trim() || diagram.name,
    });
}

// Map a JDBC/DSN URL to a ChartDB DatabaseType (for CI auto-detection).
export function databaseTypeFromUrl(url: string): string | null {
    const u = url.toLowerCase();
    if (u.includes('oracle')) return DatabaseType.ORACLE;
    if (u.includes('mariadb')) return DatabaseType.MARIADB;
    if (u.includes('mysql')) return DatabaseType.MYSQL;
    if (u.includes('postgres')) return DatabaseType.POSTGRESQL;
    if (u.includes('sqlserver') || u.includes('mssql'))
        return DatabaseType.SQL_SERVER;
    if (u.includes('sqlite')) return DatabaseType.SQLITE;
    if (u.includes('clickhouse')) return DatabaseType.CLICKHOUSE;
    if (u.includes('cockroach')) return DatabaseType.COCKROACHDB;
    return null;
}
