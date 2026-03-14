
import manifest from 'manifest';
import React from 'react';
import type {Reducer, Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {loadTabs} from './actions';
import RHSPanel from './components/rhs_panel';
import {getTranslations} from './i18n';
import reducer from './reducers';

const TabsIcon = () => (
    <svg
        width='16'
        height='16'
        viewBox='0 0 16 16'
        fill='currentColor'
        xmlns='http://www.w3.org/2000/svg'
    >
        <path d='M2 3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h10V5H6.5a.5.5 0 0 1-.5-.5V3H3zm4 0v1.5h5V5H7V3z'/>
    </svg>
);

function getUserLocale(state: GlobalState): string {
    const entities = (state as unknown as {entities: {users: {currentUserId: string; profiles: Record<string, {locale?: string}>}}}).entities;
    const userId = entities.users.currentUserId;
    const profile = entities.users.profiles?.[userId];
    return profile?.locale || 'en';
}

export default class Plugin {
    private rhsRegistration: {
        id: string;
        showRHSPlugin: object;
        hideRHSPlugin: object;
        toggleRHSPlugin: object;
    } | null = null;

    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        registry.registerReducer({reducer: reducer as Reducer});

        const locale = getUserLocale(store.getState());
        const t = getTranslations(locale);

        this.rhsRegistration = registry.registerRightHandSidebarComponent(
            RHSPanel,
            t('header.title'),
        );

        registry.registerChannelHeaderButtonAction(
            <TabsIcon/>,
            () => {
                if (this.rhsRegistration) {
                    store.dispatch(this.rhsRegistration.toggleRHSPlugin as any);
                }
            },
            t('header.title'),
            t('header.tooltip'),
        );

        registry.registerWebSocketEventHandler(
            `custom_${manifest.id}_tabs_updated`,
            (msg) => {
                const channelId = msg.data?.channel_id;
                if (channelId) {
                    store.dispatch(loadTabs(channelId) as any);
                }
            },
        );
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
