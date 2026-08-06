export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code?: string
    ) {
        super(message);
    }
}

export const apiFetch = async <T = unknown>(
    path: string,
    init: RequestInit = {}
): Promise<T> => {
    const response = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
        },
    });
    const body =
        response.status === 204
            ? undefined
            : await response.json().catch(() => undefined);
    if (!response.ok) {
        throw new ApiError(
            response.status,
            body?.error ?? `Request failed (${response.status})`,
            body?.code
        );
    }
    return body as T;
};
