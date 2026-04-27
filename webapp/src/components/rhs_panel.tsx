import React, {useEffect, useState, useCallback, useMemo, useRef} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import type {GlobalState} from '@mattermost/types/store';

import DeleteConfirm from './delete_confirm';
import PageView from './page/PageView';
import TabModal from './tab_modal';

import {
    loadTabs,
    openTabModal,
    closeTabModal,
    setEditingTab,
    createNewTab,
    updateExistingTab,
    removeTab,
    reorderChannelTabs,
    loadPluginConfig,
} from '../actions';
import * as api from '../api/client';
import {useTranslations} from '../hooks/useTranslations';
import {
    getTabsForChannel,
    isModalOpen,
    getEditingTab,
    getPluginConfig,
    getRhsPanelChannelId,
    parseChannelTabsRhsPopout,
} from '../selectors';
import type {Tab, CreateTabRequest, UpdateTabRequest} from '../types/tabs';

import '../styles/channel_tabs.scss';

interface ChannelMember {
    scheme_admin: boolean;
    roles: string;
}

type DropZone = 'before' | 'inside' | 'after';
type TabTypeFilter = 'all' | 'link' | 'page' | 'folder';

const TAB_ICONS: Record<string, string> = {
    link: '🔗',
    page: '📄',
    folder: '📁',
};

function getTabIcon(tab: Tab, isFolderTab: boolean, isExpanded: boolean): string {
    if (tab.icon) {
        return tab.icon;
    }
    if (isFolderTab) {
        return isExpanded ? '📂' : '📁';
    }
    return TAB_ICONS[tab.type] || '📎';
}

function getDropZone(e: React.DragEvent, isFolder: boolean): DropZone {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;

    if (isFolder) {
        if (y < h * 0.25) {
            return 'before';
        }
        if (y > h * 0.75) {
            return 'after';
        }
        return 'inside';
    }

    return y < h * 0.5 ? 'before' : 'after';
}

const RHSPanel: React.FC = () => {
    const dispatch = useDispatch();
    const t = useTranslations();
    const channelId = useSelector(getRhsPanelChannelId);
    const tabs = useSelector((state: GlobalState) => getTabsForChannel(state, channelId));
    const modalVisible = useSelector(isModalOpen);
    const editingTab = useSelector(getEditingTab);
    const config = useSelector(getPluginConfig);

    const isPopout = useMemo(() => window.location.pathname.startsWith('/_popout/'), []);

    const channelInfo = useSelector((state: GlobalState) => {
        const entities = (state as unknown as {entities: {channels: {channels: Record<string, {name: string; team_id: string; type?: string}>}}}).entities;
        const ch = entities.channels.channels?.[channelId];
        return ch ? {name: ch.name, teamId: ch.team_id, type: ch.type || ''} : null;
    });

    const teamName = useSelector((state: GlobalState) => {
        const entities = (state as unknown as {entities: {teams: {teams: Record<string, {name: string}>}}}).entities;
        const id = channelInfo?.teamId;
        return id ? entities.teams.teams?.[id]?.name || '' : '';
    });

    const rhsPopoutParsed = useMemo(() => {
        if (!isPopout) {
            return null;
        }
        return parseChannelTabsRhsPopout(window.location.pathname, window.location.search);
    }, [isPopout]);

    const teamNameFromPopout = rhsPopoutParsed?.teamName || '';
    const channelNameFromPopout =
        rhsPopoutParsed?.channelPathSegment || rhsPopoutParsed?.channelNameFromQuery || '';

    const effectiveTeamName = teamName || teamNameFromPopout;

    /** Popout segment is usually channel id; fall back to it for back-link until channelInfo loads. */
    const effectiveChannelName = channelInfo?.name || channelNameFromPopout;

    const dmTeammateUsername = useSelector((state: GlobalState) => {
        // In Mattermost, DM routes are /{team}/messages/@username (not /messages/{channelName}).
        // In popout mode, Redux currentChannelId may point elsewhere (e.g., town-square), so we
        // derive the teammate from the channel name in the URL (userId__userId).
        if (!effectiveChannelName.includes('__')) {
            return '';
        }
        const parts = effectiveChannelName.split('__').filter(Boolean);
        if (parts.length !== 2) {
            return '';
        }
        const [a, b] = parts;
        const myId = (state as any).entities?.users?.currentUserId as string | undefined;
        const otherId = myId && a === myId ? b : a;
        const profile = otherId ? (state as any).entities?.users?.profiles?.[otherId] : undefined;
        const username = typeof profile?.username === 'string' ? profile.username : '';
        return username ? `@${username}` : '';
    });

    const [deleteTarget, setDeleteTarget] = useState<Tab | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [viewingPageId, setViewingPageId] = useState<string | null>(null);
    const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
    const [addToFolderId, setAddToFolderId] = useState<string | undefined>(undefined);
    const [dropIndicator, setDropIndicator] = useState<{id: string; zone: DropZone} | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TabTypeFilter>('all');

    const dragTabRef = useRef<Tab | null>(null);

    const currentUser = useSelector((state: GlobalState) => {
        const entities = (state as unknown as {entities: {users: {currentUserId: string; profiles: Record<string, {roles: string}>}}}).entities;
        const userId = entities.users.currentUserId;
        const profile = entities.users.profiles[userId];
        return {id: userId, roles: profile?.roles || ''};
    });

    const channelMember = useSelector((state: GlobalState) => {
        const entities = (state as unknown as {entities: {channels: {membersInChannel: Record<string, Record<string, ChannelMember>>}}}).entities;
        const members = entities.channels.membersInChannel?.[channelId];
        if (!members || !currentUser.id) {
            return null;
        }
        return members[currentUser.id] || null;
    });

    useEffect(() => {
        const isSystemAdmin = currentUser.roles.includes('system_admin');
        const isChannelAdmin = channelMember?.scheme_admin || false;
        const isDirectOrGroup = channelInfo?.type === 'D' || channelInfo?.type === 'G';
        setCanManage(isSystemAdmin || isChannelAdmin || Boolean(isDirectOrGroup));
    }, [currentUser.roles, channelMember, channelInfo?.type]);

    useEffect(() => {
        if (channelId) {
            dispatch(loadTabs(channelId) as any);
        }
        setViewingPageId(null);
        setExpandedFolderId(null);
        setSearchQuery('');
        setTypeFilter('all');
    }, [channelId, dispatch]);

    useEffect(() => {
        if (!config) {
            dispatch(loadPluginConfig() as any);
        }
    }, [config, dispatch]);

    const rootTabsAll = useMemo(() => {
        return tabs.
            filter((tab) => !tab.parent_id).
            sort((a, b) => a.sort_order - b.sort_order);
    }, [tabs]);

    const childrenByFolder = useMemo(() => {
        const map: Record<string, Tab[]> = {};
        for (const tab of tabs) {
            if (tab.parent_id) {
                if (!map[tab.parent_id]) {
                    map[tab.parent_id] = [];
                }
                map[tab.parent_id].push(tab);
            }
        }
        for (const k of Object.keys(map)) {
            map[k].sort((a, b) => a.sort_order - b.sort_order);
        }
        return map;
    }, [tabs]);

    const folders = useMemo(() => tabs.filter((tab) => tab.type === 'folder' && !tab.parent_id), [tabs]);

    const viewingPage = useMemo(() => {
        if (!viewingPageId) {
            return null;
        }
        return tabs.find((tab) => tab.id === viewingPageId) || null;
    }, [tabs, viewingPageId]);

    const handleTabClick = useCallback((tab: Tab) => {
        if (tab.type === 'link') {
            window.open(tab.url, '_blank', 'noopener,noreferrer');
        } else if (tab.type === 'page') {
            setViewingPageId(tab.id);
        } else if (tab.type === 'folder') {
            setExpandedFolderId((prev) => (prev === tab.id ? null : tab.id));
        }
    }, []);

    const handleAddTab = useCallback((parentId?: string) => {
        setAddToFolderId(parentId);
        dispatch(setEditingTab(null));
        dispatch(openTabModal());
    }, [dispatch]);

    const handleBackToChannel = useCallback(() => {
        if (!effectiveTeamName) {
            return;
        }

        const base = `${window.location.origin}/${effectiveTeamName}`;
        const looksLikeDM = effectiveChannelName.includes('__');
        const isDirect = channelInfo?.type === 'D' || looksLikeDM;
        const isGroup = channelInfo?.type === 'G';

        let url = '';
        if (isDirect) {
            if (!dmTeammateUsername) {
                return;
            }
            url = `${base}/messages/${dmTeammateUsername}`;
        } else if (isGroup) {
            if (!effectiveChannelName) {
                return;
            }
            url = `${base}/channels/${effectiveChannelName}`;
        } else {
            if (!effectiveChannelName) {
                return;
            }
            url = `${base}/channels/${effectiveChannelName}`;
        }

        // Best-effort: focus opener if present, but do NOT close this window.
        // Some environments null out window.opener and Mattermost may try to postMessage on close.
        try {
            if (window.opener && !window.opener.closed) {
                window.opener.focus();
            }
        } catch {
            // ignore
        }

        window.location.href = url;
    }, [channelInfo?.type, dmTeammateUsername, effectiveChannelName, effectiveTeamName]);

    const handleEditTab = useCallback((tab: Tab) => {
        dispatch(setEditingTab(tab));
        dispatch(openTabModal());
    }, [dispatch]);

    const handleConfirmDelete = useCallback(() => {
        if (deleteTarget) {
            dispatch(removeTab(channelId, deleteTarget.id) as any);
            if (viewingPageId === deleteTarget.id) {
                setViewingPageId(null);
            }
            setDeleteTarget(null);
        }
    }, [deleteTarget, channelId, viewingPageId, dispatch]);

    const handleCreate = useCallback((req: CreateTabRequest) => {
        dispatch(createNewTab(channelId, req) as any);
    }, [channelId, dispatch]);

    const handleUpdate = useCallback((tabId: string, req: UpdateTabRequest) => {
        dispatch(updateExistingTab(channelId, tabId, req) as any);
    }, [channelId, dispatch]);

    const handleCloseModal = useCallback(() => {
        dispatch(closeTabModal());
        setAddToFolderId(undefined);
    }, [dispatch]);

    const handlePageContentSaved = useCallback(() => {
        dispatch(loadTabs(channelId) as any);
    }, [channelId, dispatch]);

    // --- Drag & Drop ---

    const handleDragStart = useCallback((e: React.DragEvent, tab: Tab) => {
        if (!canManage) {
            e.preventDefault();
            return;
        }
        dragTabRef.current = tab;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
    }, [canManage]);

    const handleDragEnd = useCallback(() => {
        dragTabRef.current = null;
        setDropIndicator(null);
    }, []);

    const handleItemDragOver = useCallback((e: React.DragEvent, tab: Tab) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (!dragTabRef.current || dragTabRef.current.id === tab.id) {
            setDropIndicator(null);
            return;
        }

        const zone = getDropZone(e, tab.type === 'folder' && dragTabRef.current.type !== 'folder');
        setDropIndicator({id: tab.id, zone});
    }, []);

    const reorderSiblings = useCallback((srcTab: Tab, targetTab: Tab, position: 'before' | 'after') => {
        const parentId = targetTab.parent_id || '';
        const siblings = parentId ?
            [...(childrenByFolder[parentId] || [])] :
            [...rootTabsAll];

        const withoutSrc = siblings.filter((s) => s.id !== srcTab.id);

        let tgtIdx = withoutSrc.findIndex((s) => s.id === targetTab.id);
        if (tgtIdx === -1) {
            return;
        }
        if (position === 'after') {
            tgtIdx++;
        }

        const ids = [...withoutSrc.map((s) => s.id)];
        ids.splice(tgtIdx, 0, srcTab.id);

        dispatch(reorderChannelTabs(channelId, ids) as any);
    }, [channelId, dispatch, childrenByFolder, rootTabsAll]);

    const filteredChildrenByFolder = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery = (tab: Tab): boolean => {
            if (!q) {
                return true;
            }
            const title = tab.title || '';
            const url = tab.type === 'link' ? (tab.url || '') : '';
            const content = tab.type === 'page' ? (tab.content || '') : '';
            return `${title} ${url} ${content}`.toLowerCase().includes(q);
        };

        const matchesType = (tab: Tab): boolean => {
            if (typeFilter === 'all') {
                return true;
            }
            return tab.type === typeFilter;
        };

        const map: Record<string, Tab[]> = {};
        for (const [folderId, children] of Object.entries(childrenByFolder)) {
            map[folderId] = children.filter((child) => matchesType(child) && matchesQuery(child));
        }
        return map;
    }, [childrenByFolder, searchQuery, typeFilter]);

    const filteredRootTabs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery = (tab: Tab): boolean => {
            if (!q) {
                return true;
            }
            const title = tab.title || '';
            const url = tab.type === 'link' ? (tab.url || '') : '';
            const content = tab.type === 'page' ? (tab.content || '') : '';
            return `${title} ${url} ${content}`.toLowerCase().includes(q);
        };

        const matchesType = (tab: Tab): boolean => {
            if (typeFilter === 'all') {
                return true;
            }
            return tab.type === typeFilter;
        };

        return rootTabsAll.filter((tab) => {
            if (tab.type !== 'folder') {
                return matchesType(tab) && matchesQuery(tab);
            }

            const children = filteredChildrenByFolder[tab.id] || [];

            const folderSelfByType = matchesType(tab) && matchesQuery(tab);
            const folderSelfBySearch = Boolean(q) && matchesQuery(tab);

            return folderSelfByType || folderSelfBySearch || children.length > 0;
        });
    }, [rootTabsAll, filteredChildrenByFolder, searchQuery, typeFilter]);

    useEffect(() => {
        if (!expandedFolderId) {
            return;
        }
        const stillVisible = filteredRootTabs.some((t2) => t2.type === 'folder' && t2.id === expandedFolderId);
        if (!stillVisible) {
            setExpandedFolderId(null);
        }
    }, [expandedFolderId, filteredRootTabs]);

    // When searching, automatically expand the first folder that contains matches
    // so the user can immediately see the highlighted document.
    useEffect(() => {
        const q = searchQuery.trim();
        const isFiltering = typeFilter !== 'all' || Boolean(q);
        if (!isFiltering) {
            return;
        }

        const expandedChildren = expandedFolderId ? filteredChildrenByFolder[expandedFolderId] : undefined;
        if (expandedFolderId && expandedChildren && expandedChildren.length > 0) {
            return;
        }

        let folderToOpen: string | null = null;
        for (const tab of filteredRootTabs) {
            if (tab.type !== 'folder') {
                continue;
            }
            const children = filteredChildrenByFolder[tab.id] || [];
            if (children.length > 0) {
                folderToOpen = tab.id;
                break;
            }
        }

        setExpandedFolderId(folderToOpen);
    }, [searchQuery, typeFilter, filteredRootTabs, filteredChildrenByFolder, expandedFolderId]);

    const handleDropOnItem = useCallback(async (e: React.DragEvent, targetTab: Tab) => {
        e.preventDefault();
        e.stopPropagation();

        const zone = dropIndicator?.id === targetTab.id ? dropIndicator.zone : 'after';
        setDropIndicator(null);

        const srcTab = dragTabRef.current;
        if (!srcTab || srcTab.id === targetTab.id) {
            return;
        }

        const srcParent = srcTab.parent_id || '';
        const tgtParent = targetTab.parent_id || '';

        // "inside" zone — move into the folder
        if (zone === 'inside' && targetTab.type === 'folder' && srcTab.type !== 'folder') {
            if (srcParent === targetTab.id) {
                return;
            }
            try {
                await api.moveTab(channelId, srcTab.id, targetTab.id);
                dispatch(loadTabs(channelId) as any);
                setExpandedFolderId(targetTab.id);
            } catch {
                // silent
            }
            return;
        }

        // "before" / "after" zone — reorder at the target's level
        if (srcParent === tgtParent) {
            reorderSiblings(srcTab, targetTab, zone === 'before' ? 'before' : 'after');
            return;
        }

        // Different levels: move to target's level first, then reorder
        if (srcTab.type !== 'folder' || tgtParent === '') {
            try {
                await api.moveTab(channelId, srcTab.id, tgtParent);
                dispatch(loadTabs(channelId) as any);
            } catch {
                // silent
            }
        }
    }, [channelId, dispatch, dropIndicator, reorderSiblings]);

    const handleDropOnRootZone = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDropIndicator(null);

        const srcTab = dragTabRef.current;
        if (!srcTab || !srcTab.parent_id) {
            return;
        }

        try {
            await api.moveTab(channelId, srcTab.id, '');
            dispatch(loadTabs(channelId) as any);
        } catch {
            // silent
        }
    }, [channelId, dispatch]);

    const handleRootDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    // --- Render helpers ---

    const renderTabItem = (tab: Tab, isChild = false) => {
        const isFolderTab = tab.type === 'folder';
        const isExpanded = expandedFolderId === tab.id;
        const children = filteredChildrenByFolder[tab.id] || [];
        const indicator = dropIndicator?.id === tab.id ? dropIndicator.zone : null;

        return (
            <div
                key={tab.id}
                className={'rhs-tabs-item-wrapper' + (isChild ? ' rhs-tabs-item-wrapper--child' : '')}
            >
                {indicator === 'before' && <div className='rhs-tabs-drop-line'/>}
                <div
                    className={
                        'rhs-tabs-item' +
                        (tab.is_active ? '' : ' rhs-tabs-item--inactive') +
                        (isFolderTab ? ' rhs-tabs-item--folder' : '') +
                        (isFolderTab && isExpanded ? ' rhs-tabs-item--folder-open' : '') +
                        (indicator === 'inside' ? ' rhs-tabs-item--drop-target' : '')
                    }
                    draggable={canManage}
                    onDragStart={(e) => handleDragStart(e, tab)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleItemDragOver(e, tab)}
                    onDragLeave={() => setDropIndicator(null)}
                    onDrop={(e) => handleDropOnItem(e, tab)}
                >
                    <div
                        className='rhs-tabs-item__main'
                        onClick={() => tab.is_active && handleTabClick(tab)}
                        role='button'
                        tabIndex={0}
                    >
                        <span className='rhs-tabs-item__icon'>
                            {getTabIcon(tab, isFolderTab, isExpanded)}
                        </span>
                        <div className='rhs-tabs-item__info'>
                            <span className='rhs-tabs-item__title'>
                                {tab.title}
                                {!tab.is_active && <span className='rhs-tabs-item__badge'>{t('rhs.hidden')}</span>}
                                {isFolderTab && children.length > 0 && (
                                    <span className='rhs-tabs-item__count'>{` (${children.length})`}</span>
                                )}
                            </span>
                            {tab.type === 'link' && (
                                <span className='rhs-tabs-item__url'>{tab.url}</span>
                            )}
                            {!isFolderTab && (
                                <span className='rhs-tabs-item__type'>
                                    {tab.type === 'page' ? t('rhs.typePage') : t('rhs.typeLink')}
                                </span>
                            )}
                        </div>
                        {tab.type === 'link' && (
                            <span
                                className='rhs-tabs-item__open-icon'
                                title={t('rhs.opensNewTab')}
                            >{'↗'}</span>
                        )}
                        {isFolderTab && (
                            <span className='rhs-tabs-item__chevron'>
                                {isExpanded ? '▲' : '▼'}
                            </span>
                        )}
                    </div>

                    {canManage && (
                        <div className='rhs-tabs-item__actions'>
                            <span
                                className='rhs-tabs-item__drag-handle'
                                title={t('rhs.dragReorder')}
                            >{'⠿'}</span>
                            <button
                                className='rhs-tabs-item__action-btn'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditTab(tab);
                                }}
                                title={t('rhs.edit')}
                            >
                                {'✏️'}
                            </button>
                            {isFolderTab && (
                                <button
                                    className='rhs-tabs-item__action-btn'
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddTab(tab.id);
                                    }}
                                    title={t('rhs.addToFolder')}
                                >
                                    {'➕'}
                                </button>
                            )}
                            <button
                                className='rhs-tabs-item__action-btn rhs-tabs-item__action-btn--danger'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(tab);
                                }}
                                title={t('rhs.delete')}
                            >
                                {'🗑️'}
                            </button>
                        </div>
                    )}
                </div>
                {indicator === 'after' && <div className='rhs-tabs-drop-line'/>}

                {isFolderTab && isExpanded && (
                    <div className='rhs-tabs-folder-children'>
                        {children.length === 0 ? (
                            <div className='rhs-tabs-folder-empty'>
                                {t('rhs.emptyFolder')}
                                {canManage && (
                                    <button
                                        className='rhs-tabs-folder-empty__add'
                                        onClick={() => handleAddTab(tab.id)}
                                    >
                                        {t('rhs.addItem')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            children.map((child) => renderTabItem(child, true))
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (viewingPage) {
        return (
            <div className='rhs-tabs-panel'>
                <PageView
                    tab={viewingPage}
                    channelId={channelId}
                    canEdit={canManage}
                    onBack={() => setViewingPageId(null)}
                    onContentSaved={handlePageContentSaved}
                />
            </div>
        );
    }

    if (!channelId) {
        return (
            <div className='rhs-tabs-panel'>
                <div className='rhs-tabs-empty'>{t('rhs.selectChannel')}</div>
            </div>
        );
    }

    return (
        <div className='rhs-tabs-panel'>
            {(canManage || isPopout) && (
                <div className='rhs-tabs-header'>
                    <div>
                        {isPopout && (
                            <button
                                className='rhs-tabs-back-btn'
                                onClick={handleBackToChannel}
                                disabled={
                                    !effectiveTeamName ||
                                    (effectiveChannelName.includes('__') && !dmTeammateUsername) ||
                                    (!effectiveChannelName.includes('__') && !effectiveChannelName)
                                }
                            >
                                {'←'} {((channelInfo?.type === 'D' || channelInfo?.type === 'G') || effectiveChannelName.includes('__')) ? t('rhs.backToConversation') : t('rhs.backToChannel')}
                            </button>
                        )}
                    </div>
                    <button
                        className='rhs-tabs-add-btn'
                        onClick={() => handleAddTab()}
                        style={{display: canManage ? 'flex' : 'none'}}
                    >
                        {t('rhs.addTab')}
                    </button>
                </div>
            )}

            <div className='rhs-tabs-filters'>
                <input
                    className='rhs-tabs-filters__search'
                    type='text'
                    value={searchQuery}
                    placeholder={t('rhs.searchPlaceholder')}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label={t('rhs.searchPlaceholder')}
                />
                <select
                    className='rhs-tabs-filters__select'
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as TabTypeFilter)}
                    aria-label='Filter tabs by type'
                >
                    <option value='all'>{t('rhs.filterAll')}</option>
                    <option value='link'>{t('rhs.filterLink')}</option>
                    <option value='page'>{t('rhs.filterPage')}</option>
                    <option value='folder'>{t('rhs.filterFolder')}</option>
                </select>
            </div>

            {filteredRootTabs.length === 0 ? (
                <div className='rhs-tabs-empty'>
                    <span style={{fontSize: 40, marginBottom: 12}}>{'📑'}</span>
                    <p>{searchQuery.trim() || typeFilter !== 'all' ? t('rhs.noMatches') : t('rhs.noTabs')}</p>
                    {canManage && (
                        <p className='rhs-tabs-empty__hint'>{t('rhs.noTabsHint')}</p>
                    )}
                </div>
            ) : (
                <div
                    className='rhs-tabs-list'
                    onDragOver={handleRootDragOver}
                    onDrop={handleDropOnRootZone}
                >
                    {filteredRootTabs.map((tab) => renderTabItem(tab))}
                </div>
            )}

            <TabModal
                visible={modalVisible}
                editingTab={editingTab}
                parentId={addToFolderId}
                folders={folders}
                onClose={handleCloseModal}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
            />

            <DeleteConfirm
                tab={deleteTarget}
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default RHSPanel;
