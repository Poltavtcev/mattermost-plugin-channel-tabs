import {useMemo} from 'react';
import {useSelector} from 'react-redux';

import type {GlobalState} from '@mattermost/types/store';

import {getTranslations} from '../i18n';
import type {TranslateFn} from '../i18n';

function getUserLocale(state: GlobalState): string {
    const entities = (state as unknown as {entities: {users: {currentUserId: string; profiles: Record<string, {locale?: string}>}}}).entities;
    const userId = entities.users.currentUserId;
    const profile = entities.users.profiles?.[userId];
    return profile?.locale || 'en';
}

export function useTranslations(): TranslateFn {
    const locale = useSelector(getUserLocale);
    return useMemo(() => getTranslations(locale), [locale]);
}
