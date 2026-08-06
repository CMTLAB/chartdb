import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';

import { AdminPage } from './admin-page';

it('shows the admin sections and selected page', () => {
    render(
        <MemoryRouter initialEntries={['/admin/diagrams']}>
            <Routes>
                <Route path="/admin" element={<AdminPage />}>
                    <Route path="diagrams" element={<div>ERD 목록</div>} />
                </Route>
            </Routes>
        </MemoryRouter>
    );

    expect(
        screen.getAllByRole('link', { name: 'ERD 관리' })[0]
    ).toHaveAttribute('href', '/admin/diagrams');
    expect(
        screen.getAllByRole('link', { name: '사용자 관리' })[0]
    ).toHaveAttribute('href', '/admin/users');
    expect(
        screen.getAllByRole('link', { name: '그룹 관리' })[0]
    ).toHaveAttribute('href', '/admin/groups');
    expect(screen.getByText('ERD 목록')).toBeVisible();
});
