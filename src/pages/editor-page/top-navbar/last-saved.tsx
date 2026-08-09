import React, { useEffect, useState } from 'react';
import TimeAgo from 'timeago-react';
import { useChartDB } from '@/hooks/use-chartdb';
import { Badge } from '@/components/badge/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useTranslation } from 'react-i18next';
import type { LocaleFunc } from 'timeago.js';
import { register as registerLocale } from 'timeago.js';
import { Save } from 'lucide-react';

export interface LastSavedProps {}

const timeAgolocaleFromLanguage = async (
    language: string
): Promise<{ locale: LocaleFunc; lang: string }> => {
    let locale: LocaleFunc;
    let lang: string;
    switch (language) {
        case 'ko-KR':
        case 'ko_KR':
            locale = (await import('timeago.js/lib/lang/ko')).default;
            lang = 'ko';
            break;
        default:
            locale = (await import('timeago.js/lib/lang/en_US')).default;
            lang = 'en_US';
            break;
    }
    return { locale, lang };
};

export const LastSaved: React.FC<LastSavedProps> = () => {
    const { currentDiagram } = useChartDB();
    const { i18n } = useTranslation();
    const [language, setLanguage] = useState<string>('en_US');

    useEffect(() => {
        const updateLocale = async () => {
            const { locale, lang } = await timeAgolocaleFromLanguage(
                i18n.language
            );

            registerLocale(i18n.language, locale);
            setLanguage(lang);
        };

        updateLocale();
    }, [i18n.language]);

    return (
        <Tooltip>
            <TooltipTrigger>
                <Badge
                    variant="secondary"
                    className="flex gap-1.5 whitespace-nowrap"
                >
                    <Save size={16} />
                    <TimeAgo
                        datetime={currentDiagram.updatedAt}
                        locale={language}
                    />
                </Badge>
            </TooltipTrigger>
            <TooltipContent>
                {currentDiagram.updatedAt.toLocaleString()}
            </TooltipContent>
        </Tooltip>
    );
};
