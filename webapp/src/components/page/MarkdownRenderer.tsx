import DOMPurify from 'dompurify';
import React, {useMemo} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({content}) => {
    const sanitized = useMemo(() => {
        return DOMPurify.sanitize(content);
    }, [content]);

    return (
        <div className='page-markdown-body'>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sanitized}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(MarkdownRenderer);
