import React, {useState, useCallback, useRef, useEffect} from 'react';

import MarkdownRenderer from './MarkdownRenderer';

import * as api from '../../api/client';
import {useTranslations} from '../../hooks/useTranslations';

interface PageEditorProps {
    channelId: string;
    initialContent: string;
    onSave: (content: string) => void;
    onCancel: () => void;
    saving: boolean;
}

const MAX_CONTENT_SIZE = 50 * 1024;
const FILE_MARKDOWN_RE = /!\[([^\]]*)\]\((\/api\/v4\/files\/([a-z0-9]+))\)|\[([^\]]+)\]\((\/api\/v4\/files\/([a-z0-9]+))\)/g;

type LinkedFile = {
    id: string;
    name: string;
};

const PageEditor: React.FC<PageEditorProps> = ({channelId, initialContent, onSave, onCancel, saving}) => {
    const t = useTranslations();
    const [content, setContent] = useState(initialContent);
    const [showPreview, setShowPreview] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const linkedFiles = extractLinkedFiles(content);

    useEffect(() => {
        if (textareaRef.current && !showPreview) {
            textareaRef.current.focus();
        }
    }, [showPreview]);

    const handleSave = useCallback(() => {
        if (content.length > MAX_CONTENT_SIZE) {
            setError(t('editor.contentTooLarge', {size: (content.length / 1024).toFixed(1)}));
            return;
        }
        setError('');
        onSave(content);
    }, [content, onSave, t]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            onCancel();
        }
    }, [handleSave, onCancel]);

    const insertMarkdown = useCallback((before: string, after = '') => {
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = content.substring(start, end);
        const replacement = before + (selected || 'text') + after;
        const newContent = content.substring(0, start) + replacement + content.substring(end);
        setContent(newContent);
        setTimeout(() => {
            textarea.focus();
            const cursorPos = start + before.length + (selected || 'text').length;
            textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
    }, [content]);

    const insertTextAtCursor = useCallback((text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setContent((prev) => prev + text);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.substring(0, start) + text + content.substring(end);
        setContent(newContent);

        setTimeout(() => {
            textarea.focus();
            const cursorPos = start + text.length;
            textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
    }, [content]);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) {
            return;
        }

        setUploading(true);
        setError('');

        try {
            const uploaded = await api.uploadFile(channelId, file);
            const isImage = uploaded.mime_type?.startsWith('image/');
            const fileURL = `/api/v4/files/${uploaded.id}`;
            const markdown = isImage ?
                `![${uploaded.name}](${fileURL})` :
                `[${uploaded.name}](${fileURL})`;
            insertTextAtCursor(markdown);
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            setError(t('editor.uploadFailed', {message}));
        } finally {
            setUploading(false);
        }
    }, [channelId, insertTextAtCursor, t]);

    const handleRemoveLinkedFile = useCallback((fileID: string) => {
        setContent((prev) => removeFileFromMarkdown(prev, fileID));
    }, []);

    return (
        <div
            className='page-editor'
            onKeyDown={handleKeyDown}
        >
            <div className='page-editor__toolbar'>
                <div className='page-editor__format-btns'>
                    <button
                        onClick={() => insertMarkdown('**', '**')}
                        title={t('editor.bold')}
                    >{'B'}</button>
                    <button
                        onClick={() => insertMarkdown('*', '*')}
                        title={t('editor.italic')}
                        style={{fontStyle: 'italic'}}
                    >{'I'}</button>
                    <button
                        onClick={() => insertMarkdown('# ')}
                        title={t('editor.heading')}
                    >{'H'}</button>
                    <button
                        onClick={() => insertMarkdown('- ')}
                        title={t('editor.list')}
                    >{'•'}</button>
                    <button
                        onClick={() => insertMarkdown('[', '](url)')}
                        title={t('editor.link')}
                    >{'🔗'}</button>
                    <button
                        onClick={() => insertMarkdown('`', '`')}
                        title={t('editor.code')}
                    >{'<>'}</button>
                    <button
                        onClick={() => insertMarkdown('```\n', '\n```')}
                        title={t('editor.codeBlock')}
                    >{'{ }'}</button>
                    <button
                        onClick={() => insertMarkdown('| Col 1 | Col 2 |\n|-------|-------|\n| ', ' | cell |\n')}
                        title={t('editor.table')}
                    >{'⊞'}</button>
                    <button
                        onClick={handleUploadClick}
                        title={t('editor.upload')}
                        disabled={uploading || saving}
                    >{uploading ? '⏳' : '📎'}</button>
                </div>
                <div className='page-editor__view-toggle'>
                    <button
                        className={showPreview ? '' : 'active'}
                        onClick={() => setShowPreview(false)}
                    >
                        {t('editor.edit')}
                    </button>
                    <button
                        className={showPreview ? 'active' : ''}
                        onClick={() => setShowPreview(true)}
                    >
                        {t('editor.preview')}
                    </button>
                </div>
            </div>

            {error && (
                <div className='page-editor__error'>{error}</div>
            )}

            <div className='page-editor__body'>
                <input
                    ref={fileInputRef}
                    type='file'
                    style={{display: 'none'}}
                    onChange={handleFileSelected}
                />
                {!showPreview && linkedFiles.length > 0 && (
                    <div className='page-editor__files'>
                        <div className='page-editor__files-title'>{t('editor.filesAttached')}</div>
                        <div className='page-editor__files-list'>
                            {linkedFiles.map((file) => (
                                <div
                                    key={file.id}
                                    className='page-editor__file-item'
                                >
                                    <span className='page-editor__file-name'>{file.name}</span>
                                    <button
                                        className='page-editor__file-remove'
                                        onClick={() => handleRemoveLinkedFile(file.id)}
                                        title={t('editor.removeFile')}
                                        type='button'
                                    >
                                        {'✕'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {showPreview ? (
                    <div className='page-editor__preview'>
                        {content ? (
                            <MarkdownRenderer content={content}/>
                        ) : (
                            <div className='page-editor__empty-preview'>{t('editor.nothingToPreview')}</div>
                        )}
                    </div>
                ) : (
                    <textarea
                        ref={textareaRef}
                        className='page-editor__textarea'
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={t('editor.placeholder')}
                        spellCheck={true}
                    />
                )}
            </div>

            <div className='page-editor__footer'>
                <span className='page-editor__char-count'>
                    {(content.length / 1024).toFixed(1)}{t('editor.sizeLabel')}
                </span>
                <div className='page-editor__actions'>
                    <button
                        className='channel-tabs-modal__btn channel-tabs-modal__btn--secondary'
                        onClick={onCancel}
                        disabled={saving}
                    >
                        {t('editor.cancel')}
                    </button>
                    <button
                        className='channel-tabs-modal__btn channel-tabs-modal__btn--primary'
                        onClick={handleSave}
                        disabled={saving || uploading}
                    >
                        {saving ? t('editor.saving') : getPrimaryButtonLabel(uploading, t)}
                    </button>
                </div>
            </div>
        </div>
    );
};

function getPrimaryButtonLabel(uploading: boolean, t: (key: string) => string): string {
    if (uploading) {
        return t('editor.uploading');
    }
    return t('editor.save');
}

function extractLinkedFiles(markdown: string): LinkedFile[] {
    const map = new Map<string, LinkedFile>();
    for (const match of markdown.matchAll(FILE_MARKDOWN_RE)) {
        const id = match[3] || match[7];
        const name = match[1] || match[4];
        if (id && name && !map.has(id)) {
            map.set(id, {id, name});
        }
    }
    return [...map.values()];
}

function removeFileFromMarkdown(markdown: string, fileID: string): string {
    if (!fileID) {
        return markdown;
    }
    const escaped = fileID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const targetRe = new RegExp(`!?\\[[^\\]]*\\]\\(\\/api\\/v4\\/files\\/${escaped}\\)\\n?`, 'g');
    const cleaned = markdown.replace(targetRe, '');
    return cleaned.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export default PageEditor;
