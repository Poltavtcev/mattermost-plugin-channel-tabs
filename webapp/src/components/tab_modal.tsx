import React, {useState, useCallback, useEffect} from 'react';

import type {Tab, TabType, CreateTabRequest, UpdateTabRequest} from '../types/tabs';
import {useTranslations} from '../hooks/useTranslations';

import EmojiPicker from './emoji_picker';

interface TabModalProps {
    visible: boolean;
    editingTab: Tab | null;
    parentId?: string;
    folders: Tab[];
    onClose: () => void;
    onCreate: (req: CreateTabRequest) => void;
    onUpdate: (tabId: string, req: UpdateTabRequest) => void;
}

const TabModal: React.FC<TabModalProps> = ({visible, editingTab, parentId, folders, onClose, onCreate, onUpdate}) => {
    const t = useTranslations();
    const [title, setTitle] = useState('');
    const [icon, setIcon] = useState('');
    const [url, setUrl] = useState('');
    const [tabType, setTabType] = useState<TabType>('link');
    const [targetParent, setTargetParent] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (editingTab) {
            setTitle(editingTab.title);
            setIcon(editingTab.icon || '');
            setUrl(editingTab.url || '');
            setTabType(editingTab.type);
            setTargetParent(editingTab.parent_id || '');
            setIsActive(editingTab.is_active);
        } else {
            setTitle('');
            setIcon('');
            setUrl('');
            setTabType('link');
            setTargetParent(parentId || '');
            setIsActive(true);
        }
        setError('');
    }, [editingTab, visible, parentId]);

    const handleSubmit = useCallback(() => {
        if (!title.trim()) {
            setError(t('modal.errTitleRequired'));
            return;
        }
        if (title.length > 100) {
            setError(t('modal.errTitleLength'));
            return;
        }
        if (tabType === 'link' && !url.trim()) {
            setError(t('modal.errUrlRequired'));
            return;
        }
        if (tabType === 'link') {
            try {
                new URL(url);
            } catch {
                setError(t('modal.errUrlInvalid'));
                return;
            }
        }

        if (editingTab) {
            const updates: UpdateTabRequest = {};
            if (title !== editingTab.title) {
                updates.title = title;
            }
            if (icon !== (editingTab.icon || '')) {
                updates.icon = icon;
            }
            if (tabType === 'link' && url !== editingTab.url) {
                updates.url = url;
            }
            if (isActive !== editingTab.is_active) {
                updates.is_active = isActive;
            }
            onUpdate(editingTab.id, updates);
        } else {
            const req: CreateTabRequest = {
                title: title.trim(),
                type: tabType,
                parent_id: targetParent || undefined,
            };
            if (icon) {
                req.icon = icon;
            }
            if (tabType === 'link') {
                req.url = url.trim();
            }
            onCreate(req);
        }
    }, [title, icon, url, tabType, targetParent, isActive, editingTab, onCreate, onUpdate, t]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    }, [onClose, handleSubmit]);

    if (!visible) {
        return null;
    }

    const showParentSelect = !editingTab && tabType !== 'folder' && folders.length > 0;

    return (
        <div
            className='channel-tabs-modal-backdrop'
            onClick={(e) => { if (e.target === e.currentTarget) { onClose(); } }}
            onKeyDown={handleKeyDown}
        >
            <div className='channel-tabs-modal'>
                <div className='channel-tabs-modal__header'>
                    <h3>{editingTab ? t('modal.editTab') : t('modal.addNewTab')}</h3>
                    <button className='channel-tabs-modal__close' onClick={onClose}>{'✕'}</button>
                </div>

                <div className='channel-tabs-modal__body'>
                    {error && <div className='channel-tabs-modal__error'>{error}</div>}

                    {!editingTab && (
                        <div className='channel-tabs-modal__field'>
                            <label htmlFor='tab-type'>{t('modal.type')}</label>
                            <select
                                id='tab-type'
                                value={tabType}
                                onChange={(e) => setTabType(e.target.value as TabType)}
                            >
                                <option value='link'>{t('modal.typeLink')}</option>
                                <option value='page'>{t('modal.typePage')}</option>
                                <option value='folder'>{t('modal.typeFolder')}</option>
                            </select>
                        </div>
                    )}

                    <div className='channel-tabs-modal__field channel-tabs-modal__field--row'>
                        <div className='channel-tabs-modal__field--grow'>
                            <label htmlFor='tab-title'>{t('modal.title')}</label>
                            <input
                                id='tab-title'
                                type='text'
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={
                                    tabType === 'folder'
                                        ? t('modal.placeholderFolder')
                                        : tabType === 'page'
                                            ? t('modal.placeholderPage')
                                            : t('modal.placeholderLink')
                                }
                                maxLength={100}
                                autoFocus={true}
                            />
                        </div>
                        <EmojiPicker value={icon} onChange={setIcon}/>
                    </div>

                    {tabType === 'link' && (
                        <div className='channel-tabs-modal__field'>
                            <label htmlFor='tab-url'>{t('modal.url')}</label>
                            <input
                                id='tab-url'
                                type='text'
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder={t('modal.placeholderUrl')}
                            />
                        </div>
                    )}

                    {showParentSelect && (
                        <div className='channel-tabs-modal__field'>
                            <label htmlFor='tab-parent'>{t('modal.location')}</label>
                            <select
                                id='tab-parent'
                                value={targetParent}
                                onChange={(e) => setTargetParent(e.target.value)}
                            >
                                <option value=''>{t('modal.rootLevel')}</option>
                                {folders.map((f) => (
                                    <option key={f.id} value={f.id}>{(f.icon || '📁') + ' ' + f.title}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {tabType === 'page' && !editingTab && (
                        <div className='channel-tabs-modal__hint'>{t('modal.hintPage')}</div>
                    )}

                    {tabType === 'folder' && !editingTab && (
                        <div className='channel-tabs-modal__hint'>{t('modal.hintFolder')}</div>
                    )}

                    {editingTab && (
                        <div className='channel-tabs-modal__field'>
                            <label>
                                <input
                                    type='checkbox'
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    style={{marginRight: 8}}
                                />
                                {t('modal.visible')}
                            </label>
                        </div>
                    )}
                </div>

                <div className='channel-tabs-modal__footer'>
                    <button className='channel-tabs-modal__btn channel-tabs-modal__btn--secondary' onClick={onClose}>
                        {t('modal.cancel')}
                    </button>
                    <button
                        className='channel-tabs-modal__btn channel-tabs-modal__btn--primary'
                        onClick={handleSubmit}
                        disabled={!title.trim() || (tabType === 'link' && !url.trim())}
                    >
                        {editingTab ? t('modal.saveChanges') : t('modal.addTab')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TabModal;
