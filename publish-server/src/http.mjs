export const publicUser = (row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
});

export const isSameOrigin = (request) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (!origin || !host) return false;
    try {
        const parsed = new URL(origin);
        const forwardedProtocol = String(
            request.headers['x-forwarded-proto'] ?? request.protocol
        ).split(',')[0];
        return (
            parsed.host === host && parsed.protocol === `${forwardedProtocol}:`
        );
    } catch {
        return false;
    }
};

export const isNonEmptyString = (value, maxLength = 255) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;

export const trimString = (value) =>
    typeof value === 'string' ? value.trim() : value;
