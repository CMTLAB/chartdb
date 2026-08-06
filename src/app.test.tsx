import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from './app';

vi.mock('react-router-dom', () => ({
    RouterProvider: () => <main>Admin route</main>,
}));
vi.mock('./router', () => ({ router: {} }));
vi.mock('./helmet/helmet-data', () => ({ HelmetData: () => null }));
vi.mock('./context/auth-context/auth-provider', () => ({
    AuthProvider: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('react-responsive', () => ({ useMediaQuery: () => false }));
vi.mock('react-hotkeys-hook', () => ({ useHotkeys: vi.fn() }));

beforeEach(() => {
    localStorage.setItem('theme', 'dark');
});

afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
});

it('restores the saved theme on a directly loaded route', async () => {
    render(<App />);

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
});
