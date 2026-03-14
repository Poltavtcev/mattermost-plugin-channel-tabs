export type TabType = 'link' | 'page' | 'folder';

export interface Tab {
    id: string;
    title: string;
    icon?: string;
    url?: string;
    post_id?: string;
    type: TabType;
    parent_id: string;
    content?: string;
    format?: string;
    sort_order: number;
    is_active: boolean;
    permissions?: string[];
    created_by: string;
    created_at: number;
    updated_at: number;
}

export interface ChannelTabs {
    channel_id: string;
    tabs: Tab[];
    version: number;
}

export interface CreateTabRequest {
    title: string;
    icon?: string;
    url?: string;
    type: TabType;
    parent_id?: string;
    content?: string;
    permissions?: string[];
}

export interface UpdateTabRequest {
    title?: string;
    icon?: string;
    url?: string;
    is_active?: boolean;
    permissions?: string[];
}

export interface UpdatePageContentRequest {
    content: string;
}

export interface MoveTabRequest {
    parent_id: string;
}

export interface ReorderTabsRequest {
    tab_ids: string[];
    parent_id?: string;
}

export interface PluginConfig {
    max_tabs: number;
    sync_tabs_header: boolean;
}
