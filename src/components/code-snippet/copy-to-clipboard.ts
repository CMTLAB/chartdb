export const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Insecure origins and denied permissions fall back to execCommand.
    }

    const previousFocus = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.dataset.clipboardFallback = '';
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    try {
        textarea.focus();
        textarea.select();
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
        if (previousFocus instanceof HTMLElement) {
            previousFocus.focus();
        }
    }
};
