import {combineReducers} from 'redux';

import type {Tab, PluginConfig} from '../types/tabs';

export const ACTION_TYPES = {
    FETCH_TABS_REQUEST: 'CHANNEL_TABS/FETCH_TABS_REQUEST',
    FETCH_TABS_SUCCESS: 'CHANNEL_TABS/FETCH_TABS_SUCCESS',
    FETCH_TABS_FAILURE: 'CHANNEL_TABS/FETCH_TABS_FAILURE',
    OPEN_MODAL: 'CHANNEL_TABS/OPEN_MODAL',
    CLOSE_MODAL: 'CHANNEL_TABS/CLOSE_MODAL',
    SET_EDITING_TAB: 'CHANNEL_TABS/SET_EDITING_TAB',
    SET_CONFIG: 'CHANNEL_TABS/SET_CONFIG',
    CLEAR_ERROR: 'CHANNEL_TABS/CLEAR_ERROR',
} as const;

interface FetchTabsRequestAction {
    type: typeof ACTION_TYPES.FETCH_TABS_REQUEST;
    channelId: string;
}

interface FetchTabsSuccessAction {
    type: typeof ACTION_TYPES.FETCH_TABS_SUCCESS;
    channelId: string;
    tabs: Tab[];
}

interface FetchTabsFailureAction {
    type: typeof ACTION_TYPES.FETCH_TABS_FAILURE;
    error: string;
}

interface OpenModalAction {
    type: typeof ACTION_TYPES.OPEN_MODAL;
}

interface CloseModalAction {
    type: typeof ACTION_TYPES.CLOSE_MODAL;
}

interface SetEditingTabAction {
    type: typeof ACTION_TYPES.SET_EDITING_TAB;
    tab: Tab | null;
}

interface SetConfigAction {
    type: typeof ACTION_TYPES.SET_CONFIG;
    config: PluginConfig;
}

interface ClearErrorAction {
    type: typeof ACTION_TYPES.CLEAR_ERROR;
}

type ChannelTabsAction =
    | FetchTabsRequestAction
    | FetchTabsSuccessAction
    | FetchTabsFailureAction
    | OpenModalAction
    | CloseModalAction
    | SetEditingTabAction
    | SetConfigAction
    | ClearErrorAction;

function tabsByChannel(
    state: Record<string, Tab[]> = {},
    action: ChannelTabsAction,
): Record<string, Tab[]> {
    switch (action.type) {
    case ACTION_TYPES.FETCH_TABS_SUCCESS:
        return {
            ...state,
            [action.channelId]: action.tabs,
        };
    default:
        return state;
    }
}

function loading(
    state: Record<string, boolean> = {},
    action: ChannelTabsAction,
): Record<string, boolean> {
    switch (action.type) {
    case ACTION_TYPES.FETCH_TABS_REQUEST:
        return {
            ...state,
            [action.channelId]: true,
        };
    case ACTION_TYPES.FETCH_TABS_SUCCESS:
        return {
            ...state,
            [action.channelId]: false,
        };
    case ACTION_TYPES.FETCH_TABS_FAILURE:
        return state;
    default:
        return state;
    }
}

function error(
    state: string | null = null,
    action: ChannelTabsAction,
): string | null {
    switch (action.type) {
    case ACTION_TYPES.FETCH_TABS_FAILURE:
        return action.error;
    case ACTION_TYPES.CLEAR_ERROR:
        return null;
    default:
        return state;
    }
}

function modalOpen(
    state = false,
    action: ChannelTabsAction,
): boolean {
    switch (action.type) {
    case ACTION_TYPES.OPEN_MODAL:
        return true;
    case ACTION_TYPES.CLOSE_MODAL:
        return false;
    default:
        return state;
    }
}

function editingTab(
    state: Tab | null = null,
    action: ChannelTabsAction,
): Tab | null {
    switch (action.type) {
    case ACTION_TYPES.SET_EDITING_TAB:
        return action.tab;
    case ACTION_TYPES.CLOSE_MODAL:
        return null;
    default:
        return state;
    }
}

function config(
    state: PluginConfig | null = null,
    action: ChannelTabsAction,
): PluginConfig | null {
    switch (action.type) {
    case ACTION_TYPES.SET_CONFIG:
        return action.config;
    default:
        return state;
    }
}

const reducer = combineReducers({
    tabsByChannel,
    loading,
    error,
    modalOpen,
    editingTab,
    config,
});

export default reducer;
