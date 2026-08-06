import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AssignmentPicker, type AssignmentOption } from './assignment-picker';

const candidates: AssignmentOption[] = Array.from(
    { length: 25 },
    (_, index) => ({
        id: `candidate-${index + 1}`,
        primary: `Candidate ${index + 1}`,
    })
);

const Harness = ({
    options,
    initialIds,
    disabled = false,
}: {
    options: AssignmentOption[];
    initialIds: Set<string>;
    disabled?: boolean;
}) => {
    const [selectedIds, setSelectedIds] = useState(initialIds);
    return (
        <AssignmentPicker
            options={options}
            selectedIds={selectedIds}
            initialIds={initialIds}
            searchLabel="사용자 검색"
            disabled={disabled}
            onChange={setSelectedIds}
        />
    );
};

describe('AssignmentPicker', () => {
    it('separates current assignments and summarizes additions and removals', async () => {
        const user = userEvent.setup();
        const options = [
            {
                id: 'alex',
                primary: 'Alex',
                secondary: '@alex',
                badges: ['VIEWER'],
            },
            { id: 'second', primary: 'Second' },
            ...candidates,
        ];

        render(
            <Harness
                options={options}
                initialIds={new Set(['alex', 'second'])}
            />
        );

        expect(
            screen.getByRole('heading', { name: '현재 선택 2개' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: '추가 가능 25개' })
        ).toBeInTheDocument();
        expect(
            screen.getByText('선택 2개 · 추가 +0 · 제거 -0')
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Alex @alex 제거' })
        );
        expect(
            screen.getByText('선택 1개 · 추가 +0 · 제거 -1')
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Candidate 1 추가' })
        );
        expect(
            screen.getByText('선택 2개 · 추가 +1 · 제거 -1')
        ).toBeInTheDocument();
    });

    it('pages available options and lets an unknown selection be removed', async () => {
        const user = userEvent.setup();
        render(
            <Harness
                options={candidates}
                initialIds={new Set(['missing-id'])}
            />
        );

        expect(screen.getByText('알 수 없는 대상')).toBeInTheDocument();
        expect(screen.getByText('#missing-')).toBeInTheDocument();
        expect(screen.queryByText('Candidate 21')).not.toBeInTheDocument();

        await user.click(screen.getByRole('link', { name: 'Go to next page' }));
        expect(screen.getByText('Candidate 21')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', {
                name: '알 수 없는 대상 #missing- 제거',
            })
        );
        expect(screen.queryByText('알 수 없는 대상')).not.toBeInTheDocument();
    });

    it('filters both sections with one search', async () => {
        const user = userEvent.setup();
        render(
            <Harness
                options={[
                    { id: 'alex', primary: 'Alex', secondary: '@alex' },
                    { id: 'bravo', primary: 'Bravo', secondary: '@bravo' },
                ]}
                initialIds={new Set(['alex'])}
            />
        );

        await user.type(screen.getByRole('searchbox'), 'bravo');
        expect(screen.queryByText('Alex')).not.toBeInTheDocument();
        expect(screen.getByText('Bravo')).toBeInTheDocument();
    });

    it('locks all controls and prevents disabled additions', async () => {
        const options = [
            { id: 'active', primary: 'Active' },
            { id: 'inactive', primary: 'Inactive', disabled: true },
        ];
        const { rerender } = render(
            <Harness options={options} initialIds={new Set()} />
        );

        expect(
            screen.getByRole('button', { name: 'Inactive 추가' })
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Active 추가' })
        ).toBeEnabled();

        rerender(<Harness options={options} initialIds={new Set()} disabled />);
        expect(screen.getByRole('searchbox')).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Active 추가' })
        ).toBeDisabled();
    });
});
