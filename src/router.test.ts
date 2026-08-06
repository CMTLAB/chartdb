import { expect, it } from 'vitest';

import { router } from './router';

it('routes admin management to ERDs, users, and groups', () => {
    const pending = [...router.routes];
    let admin;
    while (pending.length > 0) {
        const route = pending.shift();
        if (route?.path === 'admin') {
            admin = route;
            break;
        }
        pending.push(...(route?.children ?? []));
    }

    expect(admin?.path).toBe('admin');
    expect(admin?.children?.some((route) => route.index)).toBe(true);
    expect(admin?.children?.map((route) => route.path).filter(Boolean)).toEqual(
        ['diagrams', 'users', 'groups']
    );
});
