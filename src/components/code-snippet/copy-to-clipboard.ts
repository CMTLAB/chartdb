export type CopyTextResult = 'copied' | 'manual' | 'failed';

export const copyTextToClipboard = async (
    text: string,
    manualCopyMessage: string
): Promise<CopyTextResult> => {
    try {
        if (window.isSecureContext && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return 'copied';
        }
    } catch {
        // Permission-denied Clipboard API calls use the manual fallback.
    }

    try {
        window.prompt(manualCopyMessage, text);
        return 'manual';
    } catch {
        return 'failed';
    }
};
