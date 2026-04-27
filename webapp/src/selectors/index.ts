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

type ChannelEntity = {id: string; name: string; team_id: string};

type EntitiesSlice = {
    teams?: {teams?: Record<string, {id: string; name: string}>};
    channels?: {channels?: Record<string, ChannelEntity>};
};

function readEntities(state: GlobalState): EntitiesSlice | undefined {
    return (state as unknown as {entities?: EntitiesSlice}).entities;
}

/** Mattermost channel/user ids are typically 26-char lowercase alphanumeric strings. */
function looksLikeMattermostId(segment: string): boolean {
    return (/^[a-z0-9]{26}$/).test(segment);
}

function findChannelIdByName(chMap: Record<string, ChannelEntity>, name: string): string {
    for (const ch of Object.values(chMap)) {
        if (ch.name === name) {
            return ch.id;
        }
    }
    return '';
}

export type ChannelTabsRhsPopoutParsed = {
    teamName: string;

    /** Between /rhs/{team}/ and /plugin/: channel.Name (e.g. test2) or legacy 26-char id */
    channelPathSegment: string;

    /** Optional ?channel= (some Mattermost builds); path segment takes precedence when present */
    channelNameFromQuery: string;
};

/**
 * Canonical hint URL: /_popout/rhs/{team}/{channelName}/plugin/channel-tabs
 * ({channelName} is Channel.Name — URL slug or generated handle, same as Mattermost web routes).
 */
export function parseChannelTabsRhsPopout(pathname: string, search: string): ChannelTabsRhsPopoutParsed {
    const empty: ChannelTabsRhsPopoutParsed = {teamName: '', channelPathSegment: '', channelNameFromQuery: ''};
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== '_popout' || parts[1] !== 'rhs') {
        return empty;
    }

    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const channelNameFromQuery = params.get('channel') || '';

    // /_popout/rhs/{team}/{channel}/plugin/{pluginId}
    if (parts.length === 6 && parts[4] === 'plugin' && parts[5]) {
        return {
            teamName: parts[2] || '',
            channelPathSegment: parts[3] || '',
            channelNameFromQuery,
        };
    }

    // /_popout/rhs/{team}/plugin/{pluginId}?channel=... (no segment in path)
    if (parts.length === 5 && parts[3] === 'plugin' && parts[4] && !looksLikeMattermostId(parts[2])) {
        return {
            teamName: parts[2] || '',
            channelPathSegment: '',
            channelNameFromQuery,
        };
    }

    // Collapsed empty team: /_popout/rhs/{channelId}/plugin/{pluginId}
    if (parts.length === 5 && parts[3] === 'plugin' && parts[4] && looksLikeMattermostId(parts[2])) {
        return {
            teamName: '',
            channelPathSegment: parts[2] || '',
            channelNameFromQuery,
        };
    }

    return empty;
}

function resolveLegacyPopoutChannelSegment(
    state: GlobalState,
    teamName: string,
    channelSegment: string,
): string {
    if (!channelSegment) {
        return '';
    }

    let decTeam = teamName;
    let decSeg = channelSegment;
    try {
        decTeam = decodeURIComponent(teamName);
        decSeg = decodeURIComponent(channelSegment);
    } catch {
        // use raw
    }

    const entities = readEntities(state);
    const chMap = entities?.channels?.channels;

    if (chMap) {
        const direct = chMap[decSeg as keyof typeof chMap];
        if (direct && direct.id === decSeg) {
            return decSeg;
        }
    }

    if (looksLikeMattermostId(decSeg)) {
        return decSeg;
    }

    if (!entities?.teams?.teams || !chMap || !decTeam) {
        return '';
    }

    let teamId = '';
    for (const t of Object.values(entities.teams.teams)) {
        if (t.name === decTeam) {
            teamId = t.id;
            break;
        }
    }
    if (!teamId) {
        return '';
    }

    for (const ch of Object.values(chMap)) {
        if (ch.team_id === teamId && ch.name === decSeg) {
            return ch.id;
        }
    }
    return '';
}

/** Resolves channel id for /_popout/rhs/... Channel Tabs windows. */
export function resolveChannelIdFromPopoutPath(state: GlobalState, pathname: string, search: string): string {
    if (!pathname.startsWith('/_popout/rhs/')) {
        return '';
    }

    const parsed = parseChannelTabsRhsPopout(pathname, search);
    const chMap = readEntities(state)?.channels?.channels;

    if (parsed.channelPathSegment) {
        return resolveLegacyPopoutChannelSegment(state, parsed.teamName, parsed.channelPathSegment);
    }

    if (parsed.channelNameFromQuery && chMap) {
        const id = findChannelIdByName(chMap, parsed.channelNameFromQuery);
        if (id) {
            return id;
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
    const resolved = resolveChannelIdFromPopoutPath(state, path, window.location.search);
    return resolved || getCurrentChannelId(state);
}
