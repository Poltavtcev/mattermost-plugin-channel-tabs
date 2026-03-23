import manifest from 'manifest';

import type {ChannelTabs, CreateTabRequest, UpdateTabRequest, ReorderTabsRequest, Tab, PluginConfig} from '../types/tabs';

function base(): string {
    return `/plugins/${manifest.id}/api/v1`;
}

function headers(json = true): Record<string, string> {
    const h: Record<string, string> = {'X-Requested-With': 'XMLHttpRequest'};
    if (json) {
        h['Content-Type'] = 'application/json';
    }
    return h;
}

async function ok<T>(r: Response): Promise<T> {
    if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `Request failed: ${r.status}`);
    }
    return r.json() as Promise<T>;
}

export async function fetchTabs(channelId: string): Promise<ChannelTabs> {
    const r = await fetch(`${base()}/tabs?channel_id=${encodeURIComponent(channelId)}`, {method: 'GET', headers: headers()});
    return ok<ChannelTabs>(r);
}

export async function createTab(channelId: string, tab: CreateTabRequest): Promise<Tab> {
    const r = await fetch(`${base()}/tabs?channel_id=${encodeURIComponent(channelId)}`, {method: 'POST', headers: headers(), body: JSON.stringify(tab)});
    return ok<Tab>(r);
}

export async function updateTab(channelId: string, tabId: string, updates: UpdateTabRequest): Promise<ChannelTabs> {
    const r = await fetch(`${base()}/tabs/${encodeURIComponent(tabId)}?channel_id=${encodeURIComponent(channelId)}`, {method: 'PUT', headers: headers(), body: JSON.stringify(updates)});
    return ok<ChannelTabs>(r);
}

export async function updatePageContent(channelId: string, tabId: string, content: string): Promise<void> {
    const r = await fetch(`${base()}/tabs/${encodeURIComponent(tabId)}/content?channel_id=${encodeURIComponent(channelId)}`, {method: 'PUT', headers: headers(), body: JSON.stringify({content})});
    if (!r.ok) {
        throw new Error(await r.text() || `Failed: ${r.status}`);
    }
}

export async function moveTab(channelId: string, tabId: string, parentId: string): Promise<ChannelTabs> {
    const r = await fetch(`${base()}/tabs/${encodeURIComponent(tabId)}/move?channel_id=${encodeURIComponent(channelId)}`, {method: 'PUT', headers: headers(), body: JSON.stringify({parent_id: parentId})});
    return ok<ChannelTabs>(r);
}

export async function deleteTab(channelId: string, tabId: string): Promise<void> {
    const r = await fetch(`${base()}/tabs/${encodeURIComponent(tabId)}?channel_id=${encodeURIComponent(channelId)}`, {method: 'DELETE', headers: headers(false)});
    if (!r.ok) {
        throw new Error(await r.text() || `Failed: ${r.status}`);
    }
}

export async function reorderTabs(channelId: string, tabIds: string[], parentId?: string): Promise<ChannelTabs> {
    const body: ReorderTabsRequest = {tab_ids: tabIds};
    if (parentId) {
        body.parent_id = parentId;
    }
    const r = await fetch(`${base()}/tabs/reorder?channel_id=${encodeURIComponent(channelId)}`, {method: 'PUT', headers: headers(), body: JSON.stringify(body)});
    return ok<ChannelTabs>(r);
}

export async function fetchPluginConfig(): Promise<PluginConfig> {
    const r = await fetch(`${base()}/config`, {method: 'GET', headers: headers(false)});
    return ok<PluginConfig>(r);
}

type UploadedFileInfo = {
    id: string;
    name: string;
    mime_type?: string;
};

type FileUploadResponse = {
    file_infos: UploadedFileInfo[];
};

export async function uploadFile(channelId: string, file: File): Promise<UploadedFileInfo> {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('channel_id', channelId);

    const r = await fetch(`/api/v4/files?channel_id=${encodeURIComponent(channelId)}`, {
        method: 'POST',
        headers: {'X-Requested-With': 'XMLHttpRequest'},
        body: formData,
    });
    const data = await ok<FileUploadResponse>(r);
    const uploaded = data.file_infos?.[0];
    if (!uploaded) {
        throw new Error('Upload succeeded but file metadata is missing');
    }
    return uploaded;
}
