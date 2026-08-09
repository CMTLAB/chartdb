import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from './i18n';

describe('i18n configuration', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('falls back unsupported languages to English', async () => {
        await i18n.changeLanguage('fr');

        expect(i18n.resolvedLanguage).toBe('en');
        expect(i18n.t('language_select.change_language')).toBe('Language');
    });

    it('uses Korean for the browser locale', async () => {
        await i18n.changeLanguage('ko-KR');

        expect(i18n.resolvedLanguage).toBe('ko-KR');
        expect(i18n.t('language_select.change_language')).toBe('언어');
    });
});
