import DOMPurify from 'dompurify';
import React, {useMemo} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
}

function getYoutubeVideoId(href: string): string | null {
    try {
        const url = new URL(href);
        const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

        // youtu.be/<id>
        if (hostname === 'youtu.be') {
            const id = url.pathname.replace(/^\/+/, '');
            return id || null;
        }

        // youtube.com/* patterns
        if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
            const v = url.searchParams.get('v');
            if (v) {
                return v;
            }

            const parts = url.pathname.split('/').filter(Boolean);
            const idx = parts.findIndex((p) => ['shorts', 'embed', 'live'].includes(p));
            if (idx >= 0 && parts[idx + 1]) {
                return parts[idx + 1];
            }
        }
    } catch {
        // ignore invalid URLs
    }

    return null;
}

function isYoutubeHref(href?: string): href is string {
    return Boolean(href && getYoutubeVideoId(href));
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({content}) => {
    const sanitized = useMemo(() => {
        return DOMPurify.sanitize(content);
    }, [content]);

    return (
        <div className='page-markdown-body'>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{

                    // If a markdown link points to YouTube, render it as an embed.
                    // This keeps the feature scoped to youtube/youtu.be only.
                    a: ({href, children}: any) => {
                        if (isYoutubeHref(href)) {
                            const videoId = getYoutubeVideoId(href)!;
                            const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}`;

                            return (
                                <div
                                    className='youtube-embed'
                                    aria-label='YouTube video'
                                >
                                    <iframe
                                        src={embedSrc}
                                        title={`YouTube video ${videoId}`}
                                        frameBorder={0}
                                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                                        referrerPolicy='strict-origin-when-cross-origin'
                                        allowFullScreen={true}
                                    />
                                </div>
                            );
                        }

                        return (
                            <a href={href}>
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {sanitized}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(MarkdownRenderer);
