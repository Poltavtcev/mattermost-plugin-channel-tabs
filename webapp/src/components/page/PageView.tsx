import React, {useState, useCallback} from 'react';

import type {Tab} from '../../types/tabs';
import * as api from '../../api/client';
import {useTranslations} from '../../hooks/useTranslations';

import PageToolbar from './PageToolbar';
import PageEditor from './PageEditor';
import MarkdownRenderer from './MarkdownRenderer';

interface PageViewProps {
    tab: Tab;
    channelId: string;
    canEdit: boolean;
    onBack: () => void;
    onContentSaved: () => void;
}

const PageView: React.FC<PageViewProps> = ({tab, channelId, canEdit, onBack, onContentSaved}) => {
    const t = useTranslations();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = useCallback(async (content: string) => {
        setSaving(true);
        try {
            await api.updatePageContent(channelId, tab.id, content);
            setEditing(false);
            onContentSaved();
        } catch (err) {
            const message = err instanceof Error ? err.message : t('page.failedSave');
            alert(message); // eslint-disable-line no-alert
        } finally {
            setSaving(false);
        }
    }, [channelId, tab.id, onContentSaved, t]);

    if (editing) {
        return (
            <div className='page-view'>
                <PageToolbar
                    title={tab.title}
                    canEdit={false}
                    onEdit={() => {}}
                    onBack={() => setEditing(false)}
                />
                <PageEditor
                    initialContent={tab.content || ''}
                    onSave={handleSave}
                    onCancel={() => setEditing(false)}
                    saving={saving}
                />
            </div>
        );
    }

    const hasContent = Boolean(tab.content?.trim());

    return (
        <div className='page-view'>
            <PageToolbar
                title={tab.title}
                canEdit={canEdit}
                onEdit={() => setEditing(true)}
                onBack={onBack}
            />
            <div className='page-view__content'>
                {hasContent ? (
                    <MarkdownRenderer content={tab.content || ''}/>
                ) : (
                    <div className='page-view__empty'>
                        <p>{t('page.noContent')}</p>
                        {canEdit && (
                            <button
                                className='channel-tabs-modal__btn channel-tabs-modal__btn--primary'
                                onClick={() => setEditing(true)}
                            >
                                {t('page.editPage')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageView;
