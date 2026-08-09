import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { LanguageMetadata } from './types';
import { en, enMetadata } from './locales/en';
import { ko_KR, ko_KRMetadata } from './locales/ko_KR';

export const languages: LanguageMetadata[] = [enMetadata, ko_KRMetadata];

const resources = {
    en,
    [ko_KRMetadata.code]: ko_KR,
};

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        interpolation: {
            escapeValue: false,
        },
        supportedLngs: languages.map(({ code }) => code),
        fallbackLng: enMetadata.code,
        debug: false,
    });

export { i18n };
