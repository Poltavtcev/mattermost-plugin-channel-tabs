import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';

import MarkdownRenderer from './MarkdownRenderer';

import * as api from '../../api/client';
import {useTranslations} from '../../hooks/useTranslations';

interface PageEditorProps {
    channelId: string;
    initialContent: string;
    pageFileIds?: string[];
    onSave: (content: string, opts?: {dismissFileIds?: string[]; extraTrackedFileIds?: string[]}) => void;
    onCancel: () => void;
    saving: boolean;
}

const MAX_CONTENT_SIZE = 50 * 1024;

/** Matches image or link markdown; URL may be relative or absolute (Mattermost file id extracted separately). */
const FILE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)/g;
const FILE_ID_IN_URL = /\/api\/v4\/files\/([a-zA-Z0-9]+)/;

type LinkedFile = {
    id: string;
    name: string;
};

/** Image extensions for choosing ![alt](url) vs [label](url) when inserting from the chip list. */
const IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

const PageEditor: React.FC<PageEditorProps> = ({
    channelId,
    initialContent,
    pageFileIds = [],
    onSave,
    onCancel,
    saving,
}) => {
    const t = useTranslations();
    const [content, setContent] = useState(initialContent);
    const [showPreview, setShowPreview] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);

    /** Uploads in this session not yet persisted in page_file_ids (first save merges them). */
    const [sessionExtraFileIds, setSessionExtraFileIds] = useState<string[]>([]);

    /** File ids marked for removal on save (chips stay visible until save). */
    const [pendingDismissFileIds, setPendingDismissFileIds] = useState<string[]>([]);

    /** Last label we showed for each file id (markdown, upload, API, or before link was removed). */
    const [lastKnownNames, setLastKnownNames] = useState<Record<string, string>>({});
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fetchedNameIdsRef = useRef<Set<string>>(new Set());
    const prevLinkedByIdRef = useRef<Map<string, LinkedFile>>(new Map());

    const linkedFiles = useMemo(() => extractLinkedFiles(content), [content]);

    /** Only changes when file links in markdown change (not on every keystroke). */
    const linkedFilesSignature = useMemo(
        () =>
            extractLinkedFiles(content).map((f) => `${f.id}\u0001${f.name}`).sort().join('\u0002'),
        [content],
    );

    const linkedById = useMemo(() => {
        const m = new Map<string, LinkedFile>();
        for (const f of linkedFiles) {
            m.set(f.id, f);
        }
        return m;
    }, [linkedFiles]);

    const displayFileIds = useMemo(() => {
        return uniqueStrings([
            ...pageFileIds,
            ...linkedFiles.map((f) => f.id),
            ...sessionExtraFileIds,
            ...pendingDismissFileIds,
        ]);
    }, [pageFileIds, linkedFiles, sessionExtraFileIds, pendingDismissFileIds]);

    useEffect(() => {
        const linked = extractLinkedFiles(content);
        const current = new Map(linked.map((f) => [f.id, f]));
        setLastKnownNames((prev) => {
            const next = {...prev};
            for (const [id, f] of prevLinkedByIdRef.current.entries()) {
                if (!current.has(id) && f.name) {
                    next[id] = f.name;
                }
            }
            for (const [id, f] of current) {
                if (f.name) {
                    next[id] = f.name;
                }
            }
            return next;
        });
        prevLinkedByIdRef.current = current;
    }, [linkedFilesSignature]);

    useEffect(() => {
        if (textareaRef.current && !showPreview) {
            textareaRef.current.focus();
        }
    }, [showPreview]);

    useEffect(() => {
        let cancelled = false;
        const idsNeedingFetch = displayFileIds.filter(
            (id) => !linkedById.has(id) && !lastKnownNames[id] && !fetchedNameIdsRef.current.has(id),
        );
        for (const id of idsNeedingFetch) {
            fetchedNameIdsRef.current.add(id);
        }

        const run = async () => {
            await Promise.all(
                idsNeedingFetch.map(async (id) => {
                    try {
                        const info = await api.fetchFileInfo(id);
                        if (!cancelled) {
                            setLastKnownNames((prev) => ({...prev, [id]: info.name}));
                        }
                    } catch {
                        // Keep lastKnownNames[id] from markdown/upload if API fails.
                    }
                }),
            );
        };
        run().catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [displayFileIds, linkedById, lastKnownNames]);

    const displayFiles: LinkedFile[] = useMemo(() => {
        return displayFileIds.map((id) => ({
            id,
            name: linkedById.get(id)?.name || lastKnownNames[id] || id,
        }));
    }, [displayFileIds, linkedById, lastKnownNames]);

    const handleSave = useCallback(() => {
        if (content.length > MAX_CONTENT_SIZE) {
            setError(t('editor.contentTooLarge', {size: (content.length / 1024).toFixed(1)}));
            return;
        }
        setError('');
        const dismiss = new Set(pendingDismissFileIds);
        const extraTrackedFileIds = sessionExtraFileIds.filter((id) => !dismiss.has(id));
        onSave(content, {
            dismissFileIds: pendingDismissFileIds.length ? pendingDismissFileIds : undefined,
            extraTrackedFileIds: extraTrackedFileIds.length ? extraTrackedFileIds : undefined,
        });
    }, [content, onSave, pendingDismissFileIds, sessionExtraFileIds, t]);

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
            setSessionExtraFileIds((prev) => (prev.includes(uploaded.id) ? prev : [...prev, uploaded.id]));
            setLastKnownNames((prev) => ({...prev, [uploaded.id]: uploaded.name}));
            const isImage = uploaded.mime_type?.startsWith('image/');
            const fileURL = `${window.location.origin}/api/v4/files/${uploaded.id}`;
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

    const handleRemoveLinkedFile = useCallback((file: LinkedFile) => {
        setLastKnownNames((prev) => ({...prev, [file.id]: file.name}));
        setPendingDismissFileIds((prev) => (prev.includes(file.id) ? prev : [...prev, file.id]));
        setSessionExtraFileIds((prev) => prev.filter((id) => id !== file.id));
        setContent((prev) => removeFileFromMarkdown(prev, file.id));
    }, []);

    const handleInsertFileLink = useCallback((file: LinkedFile) => {
        const fileURL = `${window.location.origin}/api/v4/files/${file.id}`;
        const isImage = IMAGE_NAME_RE.test(file.name);
        const markdown = isImage ?
            `![${file.name}](${fileURL})` :
            `[${file.name}](${fileURL})`;
        insertTextAtCursor(markdown);
    }, [insertTextAtCursor]);

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
                {!showPreview && displayFiles.length > 0 && (
                    <div className='page-editor__files'>
                        <div className='page-editor__files-title'>{t('editor.filesAttached')}</div>
                        <div className='page-editor__files-chips'>
                            {displayFiles.map((file) => (
                                <div
                                    key={file.id}
                                    className='page-editor__file-chip'
                                >
                                    <button
                                        className='page-editor__file-chip-name page-editor__file-chip-name--action'
                                        type='button'
                                        title={t('editor.insertFileLink')}
                                        onClick={() => handleInsertFileLink(file)}
                                    >
                                        {file.name}
                                    </button>
                                    <button
                                        className='page-editor__file-chip-remove'
                                        onClick={() => handleRemoveLinkedFile(file)}
                                        title={t('editor.removeFile')}
                                        type='button'
                                        aria-label={t('editor.removeFile')}
                                    >
                                        {'×'}
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

function uniqueStrings(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        out.push(id);
    }
    return out;
}

function extractLinkedFiles(markdown: string): LinkedFile[] {
    const map = new Map<string, LinkedFile>();
    for (const match of markdown.matchAll(FILE_MARKDOWN_RE)) {
        const url = (match[2] || match[4] || '').trim();
        const idMatch = url.match(FILE_ID_IN_URL);
        const id = idMatch?.[1];
        if (!id || map.has(id)) {
            continue;
        }
        const rawName = (match[1] || match[3] || '').trim();
        const name = rawName || id;
        map.set(id, {id, name});
    }
    return [...map.values()];
}

function removeFileFromMarkdown(markdown: string, fileID: string): string {
    if (!fileID) {
        return markdown;
    }
    const escaped = fileID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Relative /api/v4/files/id or full URL ending with that path
    const targetRe = new RegExp(
        `!?\\[[^\\]]*\\]\\([^)]*\\/api\\/v4\\/files\\/${escaped}\\)\\n?`,
        'g',
    );
    const cleaned = markdown.replace(targetRe, '');
    return cleaned.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export default PageEditor;
