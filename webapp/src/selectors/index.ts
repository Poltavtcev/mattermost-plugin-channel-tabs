import manifest from 'manifest';

import type {GlobalState} from '@mattermost/types/store';

import type {Tab, PluginConfig} from '../types/tabs';

type PluginState = {
    tabsByChannel: Record<string, Tab[]>;
    loading: Record<string, boolean>;
    error: string | null;
    modalOpen: boolean;
    editingTab: Tab | null;
    config: PluginConfig | null;
};

function getPluginState(state: GlobalState): PluginState | undefined {
    const plugins = (state as unknown as Record<string, unknown>);
    return plugins['plugins-' + manifest.id] as PluginState | undefined;
}

export function getTabsForChannel(state: GlobalState, channelId: string): Tab[] {
    return getPluginState(state)?.tabsByChannel[channelId] || [];
}

export function isModalOpen(state: GlobalState): boolean {
    return getPluginState(state)?.modalOpen || false;
}

export function getEditingTab(state: GlobalState): Tab | null {
    return getPluginState(state)?.editingTab || null;
}

export function getPluginConfig(state: GlobalState): PluginConfig | null {
    return getPluginState(state)?.config || null;
}

export function getCurrentChannelId(state: GlobalState): string {
    return (state as unknown as {entities: {channels: {currentChannelId: string}}}).entities.channels.currentChannelId || '';
}
