
import manifest from 'manifest';
import React from 'react';
import type {Reducer, Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {createNewTab, loadTabs} from './actions';
import RHSPanel from './components/rhs_panel';
import {getTranslations} from './i18n';
import reducer from './reducers';
import {getCurrentChannelId} from './selectors';

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

function sanitizeTitle(text: string, maxLen: number): string {
    const cleaned = text.replace(/\s+/g, ' ').trim().replace(/[*_`~]/g, '').replace(/[#>]/g, '');
    if (!cleaned) {
        return '';
    }
    return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trimEnd() : cleaned;
}

function getTeamNameFromState(state: GlobalState, channelId: string): string {
    const entities = state as unknown as {
        entities?: {
            channels?: {channels?: Record<string, {team_id?: string}>};
            teams?: {teams?: Record<string, {name?: string}>};
        };
    };
    const teamId = entities.entities?.channels?.channels?.[channelId]?.team_id;
    if (!teamId) {
        return '';
    }
    return entities.entities?.teams?.teams?.[teamId]?.name || '';
}

function getCanManageTabs(state: GlobalState, channelId: string): boolean {
    const entities = state as unknown as {
        entities?: {
            users?: {
                currentUserId?: string;
                profiles?: Record<string, {roles?: string[]}>;
            };
            channels?: {
                membersInChannel?: Record<string, Record<string, {scheme_admin?: boolean}>>;
            };
        };
    };

    const userId = entities.entities?.users?.currentUserId;
    const roles = userId ? entities.entities?.users?.profiles?.[userId]?.roles || [] : [];
    const isSystemAdmin = roles.includes('system_admin');
    if (isSystemAdmin) {
        return true;
    }

    const schemeAdmin = userId ? entities.entities?.channels?.membersInChannel?.[channelId]?.[userId]?.scheme_admin || false : false;

    return Boolean(schemeAdmin);
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

        // Post menu action: add a link-tab to a post permalink.
        registry.registerPostDropdownMenuAction(
            t('post.addToTabs'),
            ((maybePost: unknown) => {
                const state = store.getState();
                const channelId = getCurrentChannelId(state);
                if (!channelId) {
                    return;
                }
                if (!getCanManageTabs(state, channelId)) {
                    return;
                }

                const post: any = maybePost as any;
                const postId: string | undefined = typeof maybePost === 'string' ? maybePost : post?.id || post?.post_id;

                if (!postId) {
                    return;
                }

                const rawMessage: string = typeof post?.message === 'string' ? post.message : '';
                const titleFromMessage = sanitizeTitle(rawMessage, 100);
                const title = titleFromMessage || t('post.tabTitleDefault');

                const teamName = getTeamNameFromState(state, channelId);
                const permalinkPath = teamName ? `/${teamName}/pl/${postId}` : `/pl/${postId}`;
                const url = `${window.location.origin}${permalinkPath}`;

                store.dispatch(createNewTab(channelId, {
                    title,
                    type: 'link',
                    url,
                }) as any);
            }) as any,
            (() => true) as any,
        );
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
