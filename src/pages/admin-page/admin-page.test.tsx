import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
    expect(
        screen.getAllByRole('link', { name: '토큰 관리' })[0]
    ).toHaveAttribute('href', '/admin/tokens');
    const navigation = screen.getAllByRole('navigation', {
        name: '관리 메뉴',
    })[0];
    expect(
        within(navigation)
            .getAllByRole('link')
            .map((link) => link.textContent)
    ).toEqual(['ERD 관리', '그룹 관리', '사용자 관리', '토큰 관리']);
    expect(screen.getByText('ERD 목록')).toBeVisible();
});
