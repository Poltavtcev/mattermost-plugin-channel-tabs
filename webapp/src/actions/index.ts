import type {Dispatch} from 'redux';

import {ACTION_TYPES} from '../reducers';
import * as api from '../api/client';
import type {CreateTabRequest, UpdateTabRequest, Tab} from '../types/tabs';

export function loadTabs(channelId: string) {
    return async (dispatch: Dispatch) => {
        dispatch({type: ACTION_TYPES.FETCH_TABS_REQUEST, channelId});
        try {
            const data = await api.fetchTabs(channelId);
            dispatch({type: ACTION_TYPES.FETCH_TABS_SUCCESS, channelId, tabs: data.tabs || []});
        } catch (err: unknown) {
            dispatch({type: ACTION_TYPES.FETCH_TABS_FAILURE, error: err instanceof Error ? err.message : 'Unknown error'});
        }
    };
}

export function createNewTab(channelId: string, tab: CreateTabRequest) {
    return async (dispatch: Dispatch) => {
        try {
            await api.createTab(channelId, tab);
            dispatch({type: ACTION_TYPES.CLOSE_MODAL});
            const data = await api.fetchTabs(channelId);
            dispatch({type: ACTION_TYPES.FETCH_TABS_SUCCESS, channelId, tabs: data.tabs || []});
        } catch (err: unknown) {
            dispatch({type: ACTION_TYPES.FETCH_TABS_FAILURE, error: err instanceof Error ? err.message : 'Unknown error'});
        }
    };
}

export function updateExistingTab(channelId: string, tabId: string, updates: UpdateTabRequest) {
    return async (dispatch: Dispatch) => {
        try {
            await api.updateTab(channelId, tabId, updates);
            dispatch({type: ACTION_TYPES.CLOSE_MODAL});
            const data = await api.fetchTabs(channelId);
            dispatch({type: ACTION_TYPES.FETCH_TABS_SUCCESS, channelId, tabs: data.tabs || []});
        } catch (err: unknown) {
            dispatch({type: ACTION_TYPES.FETCH_TABS_FAILURE, error: err instanceof Error ? err.message : 'Unknown error'});
        }
    };
}

export function removeTab(channelId: string, tabId: string) {
    return async (dispatch: Dispatch) => {
        try {
            await api.deleteTab(channelId, tabId);
            const data = await api.fetchTabs(channelId);
            dispatch({type: ACTION_TYPES.FETCH_TABS_SUCCESS, channelId, tabs: data.tabs || []});
        } catch (err: unknown) {
            dispatch({type: ACTION_TYPES.FETCH_TABS_FAILURE, error: err instanceof Error ? err.message : 'Unknown error'});
        }
    };
}

export function reorderChannelTabs(channelId: string, tabIds: string[]) {
    return async (dispatch: Dispatch) => {
        try {
            const data = await api.reorderTabs(channelId, tabIds);
            dispatch({type: ACTION_TYPES.FETCH_TABS_SUCCESS, channelId, tabs: data.tabs || []});
        } catch (err: unknown) {
            dispatch({type: ACTION_TYPES.FETCH_TABS_FAILURE, error: err instanceof Error ? err.message : 'Unknown error'});
        }
    };
}

export function openTabModal() {
    return {type: ACTION_TYPES.OPEN_MODAL};
}

export function closeTabModal() {
    return {type: ACTION_TYPES.CLOSE_MODAL};
}

export function setEditingTab(tab: Tab | null) {
    return {type: ACTION_TYPES.SET_EDITING_TAB, tab};
}

export function loadPluginConfig() {
    return async (dispatch: Dispatch) => {
        try {
            const config = await api.fetchPluginConfig();
            dispatch({type: ACTION_TYPES.SET_CONFIG, config});
        } catch {
            // best-effort
        }
    };
}

export function clearError() {
    return {type: ACTION_TYPES.CLEAR_ERROR};
}
