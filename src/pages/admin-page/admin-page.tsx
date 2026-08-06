import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { Button } from '@/components/button/button';
import { cn } from '@/lib/utils';

const sections = [
    { to: '/admin/diagrams', label: 'ERD 관리' },
    { to: '/admin/users', label: '사용자 관리' },
    { to: '/admin/groups', label: '그룹 관리' },
    { to: '/admin/tokens', label: '토큰 관리' },
];

const AdminNavigation = ({ className }: { className?: string }) => (
    <nav className={className} aria-label="관리 메뉴">
        {sections.map((section) => (
            <NavLink
                key={section.to}
                to={section.to}
                className={({ isActive }) =>
                    cn(
                        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                }
            >
                {section.label}
            </NavLink>
        ))}
    </nav>
);

export const AdminPage = () => (
    <main className="min-h-screen bg-muted/30 p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">관리자</p>
                    <h1 className="text-2xl font-semibold">접근 권한 관리</h1>
                </div>
                <Button asChild variant="secondary">
                    <Link to="/">ChartDB로 돌아가기</Link>
                </Button>
            </header>

            <AdminNavigation className="flex gap-2 overflow-x-auto md:hidden" />
            <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
                <AdminNavigation className="hidden h-fit flex-col gap-1 rounded-xl border bg-card p-3 md:flex" />
                <section className="min-w-0">
                    <Outlet />
                </section>
            </div>
        </div>
    </main>
);
