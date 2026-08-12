import 'fake-indexeddb/auto';
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { authContext } from '@/context/auth-context/auth-context';
import { useStorage } from '@/hooks/use-storage';
import { DatabaseType, type DBTable, type Diagram } from '@/lib/domain';
import type { StorageContext } from './storage-context';
import { StorageProvider } from './storage-provider';

const table = (overrides: Partial<DBTable>): DBTable => ({
    id: 'table',
    name: 'table',
    x: 0,
    y: 0,
    fields: [],
    indexes: [],
    color: '#999999',
    isView: false,
    createdAt: 1,
    ...overrides,
});

const diagram = (tables: DBTable[]): Diagram => ({
    id: 'diagram',
    name: 'ERD',
    databaseType: DatabaseType.POSTGRESQL,
    tables,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
});

describe('StorageProvider.replaceDiagram', () => {
    it('rolls back deletion when replacement storage fails', async () => {
        let storage: StorageContext | undefined;
        const CaptureStorage = () => {
            storage = useStorage();
            return null;
        };
        render(
            <authContext.Provider
                value={{
                    user: {
                        id: `replace-test-${crypto.randomUUID()}`,
                        username: 'tester',
                        displayName: 'Tester',
                        role: 'ADMIN',
                        mustChangePassword: false,
                    },
                    loading: false,
                    login: vi.fn(),
                    logout: vi.fn(),
                    changePassword: vi.fn(),
                    refresh: vi.fn(),
                }}
            >
                <StorageProvider>
                    <CaptureStorage />
                </StorageProvider>
            </authContext.Provider>
        );
        const original = diagram([table({ id: 'original-table' })]);
        await storage?.addDiagram({ diagram: original });

        await expect(
            storage?.replaceDiagram({
                diagram: diagram([
                    table({ id: 'duplicate-table' }),
                    table({ id: 'duplicate-table' }),
                ]),
            })
        ).rejects.toThrow();

        await expect(
            storage?.getDiagram('diagram', { includeTables: true })
        ).resolves.toMatchObject({
            id: 'diagram',
            tables: [expect.objectContaining({ id: 'original-table' })],
        });
    });
});
