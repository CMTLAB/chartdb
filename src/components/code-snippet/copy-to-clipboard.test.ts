import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copy-to-clipboard';

const setClipboard = (clipboard: Clipboard | undefined) => {
    vi.stubGlobal('navigator', { clipboard });
};

const setExecCommand = (execCommand: (command: string) => boolean) => {
    Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
    });
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
    document.body.innerHTML = '';
});

describe('copyTextToClipboard', () => {
    it('copies through a temporary textarea on HTTP and restores focus', async () => {
        setClipboard(undefined);
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        const execCommand = vi.fn((command: string) => {
            const textarea = document.querySelector<HTMLTextAreaElement>(
                '[data-clipboard-fallback]'
            );

            expect(command).toBe('copy');
            expect(textarea?.value).toBe('SELECT 1');
            expect(document.activeElement).toBe(textarea);
            return true;
        });
        setExecCommand(execCommand);

        await expect(copyTextToClipboard('SELECT 1')).resolves.toBe(true);
        expect(execCommand).toHaveBeenCalledOnce();
        expect(document.querySelector('[data-clipboard-fallback]')).toBeNull();
        expect(document.activeElement).toBe(input);
    });

    it('falls back when the Clipboard API rejects', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        setClipboard({ writeText } as unknown as Clipboard);
        const execCommand = vi.fn().mockReturnValue(true);
        setExecCommand(execCommand);

        await expect(copyTextToClipboard('SELECT 2')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('SELECT 2');
        expect(execCommand).toHaveBeenCalledWith('copy');
    });

    it('reports failure when neither copy path succeeds', async () => {
        setClipboard(undefined);
        setExecCommand(vi.fn().mockReturnValue(false));

        await expect(copyTextToClipboard('SELECT 3')).resolves.toBe(false);
        expect(document.querySelector('[data-clipboard-fallback]')).toBeNull();
    });

    it('does not create a textarea when the Clipboard API succeeds', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText } as unknown as Clipboard);
        const execCommand = vi.fn().mockReturnValue(true);
        setExecCommand(execCommand);

        await expect(copyTextToClipboard('SELECT 4')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('SELECT 4');
        expect(execCommand).not.toHaveBeenCalled();
    });
});
