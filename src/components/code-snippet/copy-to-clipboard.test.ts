import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copy-to-clipboard';

const setClipboard = (clipboard: Clipboard | undefined) => {
    vi.stubGlobal('navigator', { clipboard });
};

const setSecureContext = (isSecureContext: boolean) => {
    Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        value: isSecureContext,
    });
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'isSecureContext');
    document.body.innerHTML = '';
});

describe('copyTextToClipboard', () => {
    it('opens a manual copy prompt on HTTP instead of reporting automatic success', async () => {
        setSecureContext(false);
        setClipboard(undefined);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('SELECT 1');

        await expect(
            copyTextToClipboard('SELECT 1', 'Copy: Ctrl+C → Enter')
        ).resolves.toBe('manual');
        expect(prompt).toHaveBeenCalledWith('Copy: Ctrl+C → Enter', 'SELECT 1');
    });

    it('opens the manual prompt when the Clipboard API rejects', async () => {
        setSecureContext(true);
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        setClipboard({ writeText } as unknown as Clipboard);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('SELECT 2');

        await expect(
            copyTextToClipboard('SELECT 2', 'Copy: Ctrl+C → Enter')
        ).resolves.toBe('manual');
        expect(writeText).toHaveBeenCalledWith('SELECT 2');
        expect(prompt).toHaveBeenCalledWith('Copy: Ctrl+C → Enter', 'SELECT 2');
    });

    it('does not call the async Clipboard API on HTTP', async () => {
        setSecureContext(false);
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        setClipboard({ writeText } as unknown as Clipboard);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('SELECT 2');

        const result = copyTextToClipboard('SELECT 2', 'Copy: Ctrl+C → Enter');

        expect(prompt).toHaveBeenCalledOnce();
        expect(writeText).not.toHaveBeenCalled();
        await expect(result).resolves.toBe('manual');
    });

    it('reports failure when the manual prompt cannot be opened', async () => {
        setSecureContext(false);
        setClipboard(undefined);
        vi.spyOn(window, 'prompt').mockImplementation(() => {
            throw new Error('prompt blocked');
        });

        await expect(
            copyTextToClipboard('SELECT 3', 'Copy: Ctrl+C → Enter')
        ).resolves.toBe('failed');
    });

    it('reports copied only when the Clipboard API succeeds', async () => {
        setSecureContext(true);
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText } as unknown as Clipboard);
        const prompt = vi.spyOn(window, 'prompt');

        await expect(
            copyTextToClipboard('SELECT 4', 'Copy: Ctrl+C → Enter')
        ).resolves.toBe('copied');
        expect(writeText).toHaveBeenCalledWith('SELECT 4');
        expect(prompt).not.toHaveBeenCalled();
    });
});
