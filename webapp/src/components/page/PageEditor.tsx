import React, {useState, useCallback, useRef, useEffect} from 'react';

import MarkdownRenderer from './MarkdownRenderer';

import {useTranslations} from '../../hooks/useTranslations';

interface PageEditorProps {
    initialContent: string;
    onSave: (content: string) => void;
    onCancel: () => void;
    saving: boolean;
}

const MAX_CONTENT_SIZE = 50 * 1024;

const PageEditor: React.FC<PageEditorProps> = ({initialContent, onSave, onCancel, saving}) => {
    const t = useTranslations();
    const [content, setContent] = useState(initialContent);
    const [showPreview, setShowPreview] = useState(false);
    const [error, setError] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
                        disabled={saving}
                    >
                        {saving ? t('editor.saving') : t('editor.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PageEditor;
