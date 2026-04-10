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

/** Parses /_popout/rhs/<team>/<channel>/plugin/<pluginId> and finds channel id in Redux entities. */
export function resolveChannelIdFromPopoutPath(state: GlobalState, pathname: string): string {
    if (!pathname.startsWith('/_popout/rhs/')) {
        return '';
    }
    const parts = pathname.split('/').filter(Boolean);

    // _popout, rhs, <team>, <channel>, plugin, <pluginId>
    if (parts.length < 6 || parts[0] !== '_popout' || parts[1] !== 'rhs' || parts[4] !== 'plugin') {
        return '';
    }

    let teamName = parts[2];
    let channelName = parts[3];
    try {
        teamName = decodeURIComponent(teamName);
        channelName = decodeURIComponent(channelName);
    } catch {
        // use raw segments
    }

    const entities = (state as unknown as {
        entities?: {
            teams?: {teams?: Record<string, {id: string; name: string}>};
            channels?: {channels?: Record<string, {id: string; name: string; team_id: string}>};
        };
    }).entities;
    if (!entities?.teams?.teams || !entities?.channels?.channels) {
        return '';
    }

    const chMap = entities.channels.channels;

    // Segment may be channel id (Redux stores channels keyed by id) or legacy channel name/slug.
    const direct = chMap[channelName as keyof typeof chMap];
    if (direct && direct.id === channelName) {
        return channelName;
    }

    let teamId = '';
    for (const t of Object.values(entities.teams.teams)) {
        if (t.name === teamName) {
            teamId = t.id;
            break;
        }
    }
    if (!teamId) {
        return '';
    }

    for (const ch of Object.values(chMap)) {
        if (ch.team_id === teamId && ch.name === channelName) {
            return ch.id;
        }
    }
    return '';
}

/**
 * Channel id for Channel Tabs RHS: in /_popout/... windows Redux currentChannelId is often wrong or empty,
 * so we resolve the channel from the popout URL when possible.
 */
export function getRhsPanelChannelId(state: GlobalState): string {
    if (typeof window === 'undefined') {
        return getCurrentChannelId(state);
    }
    const path = window.location.pathname;
    if (!path.startsWith('/_popout/')) {
        return getCurrentChannelId(state);
    }
    const resolved = resolveChannelIdFromPopoutPath(state, path);
    return resolved || getCurrentChannelId(state);
}
