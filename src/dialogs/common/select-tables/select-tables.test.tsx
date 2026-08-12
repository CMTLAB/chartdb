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
