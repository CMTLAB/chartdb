import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { SelectTables } from './select-tables';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/use-breakpoint', () => ({
    useBreakpoint: () => ({ isMd: true }),
}));

vi.mock('@/components/dialog/dialog', () => ({
    DialogDescription: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogFooter: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogHeader: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogInternalContent: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
    DialogTitle: ({ children }: React.PropsWithChildren) => (
        <div>{children}</div>
    ),
}));

const metadata: DatabaseMetadata = {
    database_name: 'database',
    version: '1',
    tables: [
        { schema: 'public', table: 'orders' },
        { schema: 'public', table: 'users' },
    ],
    views: [],
    columns: [],
    indexes: [],
    fk_info: [],
    pk_info: [],
};

describe('SelectTables', () => {
    it('keeps the default table selection when no initial selection is supplied', () => {
        render(
            <SelectTables
                databaseMetadata={{
                    ...metadata,
                    tables: [{ schema: 'public', table: 'active_users' }],
                    views: [{ schema: 'public', view_name: 'active_users' }],
                }}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Import 1 Tables' })
        ).toBeEnabled();
    });

    it('does not preselect a current table when the latest object is a view', () => {
        const viewMetadata: DatabaseMetadata = {
            ...metadata,
            tables: [{ schema: 'public', table: 'active_users' }],
            views: [{ schema: 'public', view_name: 'active_users' }],
        };

        render(
            <SelectTables
                allowEmptySelection
                databaseMetadata={viewMetadata}
                initialSelectedTables={[
                    {
                        schema: 'public',
                        table: 'active_users',
                        type: 'table',
                    },
                ]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Import 0 Tables' })
        ).toBeEnabled();
    });

    it('preselects a current view when the latest object is still a view', () => {
        const viewMetadata: DatabaseMetadata = {
            ...metadata,
            tables: [{ schema: 'public', table: 'active_users' }],
            views: [{ schema: 'public', view_name: 'active_users' }],
        };

        render(
            <SelectTables
                databaseMetadata={viewMetadata}
                initialSelectedTables={[
                    {
                        schema: 'public',
                        table: 'active_users',
                        type: 'view',
                    },
                ]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Import 1 Tables' })
        ).toBeEnabled();
    });

    it('distinguishes dots in schema names from dots in table names', () => {
        render(
            <SelectTables
                databaseMetadata={{
                    ...metadata,
                    tables: [
                        { schema: 'a.b', table: 'c' },
                        { schema: 'a', table: 'b.c' },
                    ],
                }}
                initialSelectedTables={[
                    { schema: 'a.b', table: 'c', type: 'table' },
                ]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            within(
                screen.getByText('c').closest('div.flex.items-center.gap-3')!
            ).getByRole('checkbox')
        ).toBeChecked();
        expect(
            within(
                screen.getByText('b.c').closest('div.flex.items-center.gap-3')!
            ).getByRole('checkbox')
        ).not.toBeChecked();
    });

    it('keeps empty selection disabled unless explicitly allowed', () => {
        const { rerender } = render(
            <SelectTables
                databaseMetadata={metadata}
                initialSelectedTables={[]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Import 0 Tables' })
        ).toBeDisabled();

        rerender(
            <SelectTables
                allowEmptySelection
                databaseMetadata={metadata}
                initialSelectedTables={[]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: 'Import 0 Tables' })
        ).toBeEnabled();
    });

    it('uses the supplied initial table selection', () => {
        render(
            <SelectTables
                databaseMetadata={metadata}
                initialSelectedTables={[
                    { schema: 'public', table: 'users', type: 'table' },
                ]}
                onImport={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(
            within(
                screen
                    .getByText('users')
                    .closest('div.flex.items-center.gap-3')!
            ).getByRole('checkbox')
        ).toBeChecked();
        expect(
            within(
                screen
                    .getByText('orders')
                    .closest('div.flex.items-center.gap-3')!
            ).getByRole('checkbox')
        ).not.toBeChecked();
        expect(
            screen.getByRole('button', { name: 'Import 1 Tables' })
        ).toBeInTheDocument();
    });
});
