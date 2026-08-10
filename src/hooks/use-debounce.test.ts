import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDebounce } from './use-debounce';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

it('cancels a pending callback when unmounted', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(callback, 50));

    act(() => result.current());
    unmount();
    act(() => vi.advanceTimersByTime(50));

    expect(callback).not.toHaveBeenCalled();
});
