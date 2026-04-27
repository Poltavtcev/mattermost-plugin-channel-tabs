import DOMPurify from 'dompurify';
import React, {useMemo} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
}

/**
 * Normalize Windows / old-Mac line endings so \\n in Markdown is consistent.
 */
function normalizeNewlines(markdown: string): string {
    return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

/** Open in same tab only for in-page anchors; everything else opens a new tab (RHS is narrow). */
function shouldOpenMarkdownLinkInNewTab(href: string | undefined): boolean {
    return Boolean(href && href !== '#' && !href.startsWith('#'));
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({content}) => {
    const prepared = useMemo(() => {
        return DOMPurify.sanitize(normalizeNewlines(content));
    }, [content]);

    return (
        <div className='page-markdown-body'>
            {/*
              Micromark keeps literal \\n inside paragraph text nodes (not mdast "break" nodes).
              Default HTML/CSS collapses those newlines to spaces. white-space: pre-line (in SCSS)
              makes them visible line breaks without altering the Markdown source.
            */}
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

                        const newTab = shouldOpenMarkdownLinkInNewTab(href);
                        return (
                            <a
                                href={href}
                                {...(newTab ? {target: '_blank', rel: 'noopener noreferrer'} : {})}
                            >
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {prepared}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(MarkdownRenderer);
