import React, {useState, useCallback, useRef, useEffect} from 'react';
import ReactDOM from 'react-dom';

import {useTranslations} from '../hooks/useTranslations';

const EMOJI_LIST = [
    '📄', '📝', '📋', '📌', '📎', '📂', '📁', '🗂️',
    '🔗', '🌐', '🔒', '🔑', '⚙️', '🛠️', '🔧', '🔨',
    '📊', '📈', '📉', '💹', '💰', '💳', '🏦', '🏢',
    '📱', '💻', '🖥️', '⌨️', '🖨️', '📡', '📺', '🎮',
    '✅', '❌', '⚠️', '🚫', '💡', '🔔', '🔕', '❓',
    '❗', '✨', '🔥', '💥', '⭐', '🌟', '🏆', '🎯',
    '🚀', '🎉', '🎊', '💎', '🧩', '🏷️', '🔖', '📍',
    '👤', '👥', '👨‍💻', '👩‍💻', '🤝', '💬', '💭', '📣',
    '🌍', '🏠', '🏗️', '⚡', '☁️', '🌈', '🔮', '🛡️',
];

const DROP_W = 282;
const DROP_H = 230;

interface EmojiPickerProps {
    value: string;
    onChange: (emoji: string) => void;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({value, onChange}) => {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: 0, left: 0});
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const calcPosition = useCallback(() => {
        if (!triggerRef.current) {
            return {top: 0, left: 0};
        }
        const rect = triggerRef.current.getBoundingClientRect();
        const pad = 8;

        let top = rect.bottom + 4;
        let left = rect.right - DROP_W;

        if (top + DROP_H + pad > window.innerHeight) {
            top = rect.top - DROP_H - 4;
        }
        if (left < pad) {
            left = pad;
        }
        if (left + DROP_W + pad > window.innerWidth) {
            left = window.innerWidth - DROP_W - pad;
        }

        return {top, left};
    }, []);

    const handleToggle = useCallback(() => {
        if (open) {
            setOpen(false);
        } else {
            setPos(calcPosition());
            setOpen(true);
        }
    }, [open, calcPosition]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                (!dropdownRef.current || !dropdownRef.current.contains(target))
            ) {
                setOpen(false);
            }
        };

        const reposition = () => setPos(calcPosition());

        document.addEventListener('mousedown', handler);
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            document.removeEventListener('mousedown', handler);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [open, calcPosition]);

    const handleSelect = useCallback((emoji: string) => {
        onChange(emoji);
        setOpen(false);
    }, [onChange]);

    const handleClear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setOpen(false);
    }, [onChange]);

    return (
        <div className='emoji-picker-field'>
            <div
                ref={triggerRef}
                className='emoji-picker-field__trigger'
                onClick={handleToggle}
            >
                <span className='emoji-picker-field__preview'>
                    {value || '—'}
                </span>
                <span className='emoji-picker-field__label'>
                    {t('modal.icon')}
                </span>
                {value && (
                    <button
                        className='emoji-picker-field__clear'
                        onClick={handleClear}
                        title={t('modal.iconClear')}
                    >
                        {'✕'}
                    </button>
                )}
            </div>

            {open && ReactDOM.createPortal(
                <div
                    ref={dropdownRef}
                    className='emoji-picker-dropdown'
                    style={{top: pos.top, left: pos.left}}
                >
                    <div className='emoji-picker-dropdown__grid'>
                        {EMOJI_LIST.map((em) => (
                            <button
                                key={em}
                                className={'emoji-picker-dropdown__item' + (em === value ? ' emoji-picker-dropdown__item--selected' : '')}
                                onClick={() => handleSelect(em)}
                            >
                                {em}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default EmojiPicker;
